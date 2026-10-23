// One key custodian per Hangout. RoomDO owns sockets/messages; only this object unwraps keys.
// No HTTP key route, raw secret, or CryptoKey is exposed through RPC.
import { DurableObject } from "cloudflare:workers";
import { BIT, MAX_MESSAGE_CHARS } from "@hangcord/protocol";
import { bitsFor, importKek, insert, loadHangout, newHangoutKey, openBody, openHangoutKey, roomKey, sealBody, write, type WrappedKey } from "@hangcord/server";

interface KeyEnv { DB: D1Database; HANGCORD_KEK_V1?: string }
interface KeyRow { epoch: number; kek_version: number; iv: string; wrapped_key: string; fingerprint: string }
interface SealedMessage { id: string; authorId: string; bodyEnc: string; epoch: number }
const CACHE_MS = 10 * 60 * 1_000;
const MAX_CACHED_EPOCHS = 8; // Eviction only: old epochs remain recoverable from durable storage.
const validId = (value: string) => /^[a-z0-9_-]{1,64}$/.test(value);
const validEpoch = (epoch: number) => Number.isSafeInteger(epoch) && epoch > 0;
const fromRow = (row: KeyRow): WrappedKey => ({ epoch: row.epoch, kekVersion: row.kek_version, iv: row.iv, wrappedKey: row.wrapped_key, fingerprint: row.fingerprint });

export class HangoutDO extends DurableObject<KeyEnv> {
  private hangoutId: string | null = null;
  private activeEpoch: number | null = null;
  private cache = new Map<number, { key: CryptoKey; expires: number }>();
  private inflight = new Map<number, Promise<CryptoKey>>();
  private bootstrap: Promise<number> | null = null;

  constructor(ctx: DurableObjectState, env: KeyEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.hangoutId = (await ctx.storage.get<string>("hangoutId")) ?? null;
    });
  }

  async sealMessage(hangoutId: string, roomId: string, uid: string, messageId: string, content: string): Promise<{ bodyEnc: string; epoch: number }> {
    await this.authorize(hangoutId, roomId, uid, BIT.SEND_MESSAGES);
    if (!validId(messageId) || typeof content !== "string" || !content.trim() || content.length > MAX_MESSAGE_CHARS) throw new Error("bad_content");
    try {
      const epoch = await this.currentEpoch();
      const key = await roomKey(await this.hangoutKey(epoch), roomId);
      return { bodyEnc: await sealBody(key, { hangoutId, roomId, messageId, epoch }, content), epoch };
    } catch { return this.unavailable(); }
  }

  async openMessages(hangoutId: string, roomId: string, uid: string, records: SealedMessage[], ownOnly = false): Promise<string[]> {
    await this.authorize(hangoutId, roomId, uid, ownOnly ? BIT.SEND_MESSAGES : BIT.READ_HISTORY);
    if (!Array.isArray(records) || records.length > 50 || records.some((record) => !validId(record.id) || !validEpoch(record.epoch) || typeof record.bodyEnc !== "string" || (ownOnly && record.authorId !== uid))) throw new Error("forbidden");
    try {
      // A batch-local derived-key map is bounded by the page size and never outlives the request.
      const derived = new Map<number, Promise<CryptoKey>>();
      const opened: string[] = [];
      for (const record of records) {
        let key = derived.get(record.epoch);
        if (!key) { key = this.hangoutKey(record.epoch).then((hsk) => roomKey(hsk, roomId)); derived.set(record.epoch, key); }
        opened.push(await openBody(await key, { hangoutId, roomId, messageId: record.id, epoch: record.epoch }, record.bodyEnc));
      }
      return opened;
    } catch { return this.unavailable(); }
  }

  private async authorize(hangoutId: string, roomId: string, uid: string, action: bigint): Promise<void> {
    if (!validId(hangoutId) || !validId(roomId) || typeof uid !== "string" || !uid || uid.length > 128) throw new Error("forbidden");
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.hangoutId === null) {
        await this.ctx.storage.put("hangoutId", hangoutId);
        this.hangoutId = hangoutId;
      }
      if (this.hangoutId !== hangoutId) throw new Error("forbidden");
    });
    // No access cache: D1 permission changes apply to each crypto operation.
    const state = await loadHangout(this.env.DB, hangoutId, uid);
    const room = state?.rooms.find((candidate) => candidate.id === roomId);
    const bits = state ? bitsFor(state, roomId) : 0n;
    if (!room || room.type === "category" || (bits & (BIT.VIEW_ROOM | action)) !== (BIT.VIEW_ROOM | action)) throw new Error("forbidden");
  }

  private async currentEpoch(): Promise<number> {
    // Re-read active epoch so rotation cannot keep encrypting with a cached old key.
    const row = await this.env.DB.prepare("SELECT epoch FROM hangout_keys WHERE hangout_id = ? AND retired_at IS NULL ORDER BY epoch DESC LIMIT 1")
      .bind(this.hangoutId).first<{ epoch: number }>();
    let epoch: number;
    if (row) {
      if (!validEpoch(row.epoch)) throw new Error("key_integrity");
      epoch = row.epoch;
    } else {
      this.bootstrap ??= this.initialize().finally(() => { this.bootstrap = null; });
      epoch = await this.bootstrap;
    }
    if (this.activeEpoch !== null && this.activeEpoch !== epoch) this.cache.clear();
    this.activeEpoch = epoch;
    return epoch;
  }

  private async initialize(): Promise<number> {
    // Never replace missing keys after initialization, or when any key/message already exists.
    let record = await this.ctx.storage.get<WrappedKey>("bootstrap:key");
    if (!record) {
      const previous = await this.ctx.storage.get<boolean>("initialized");
      const local = await this.ctx.storage.list({ prefix: "key:", limit: 1 });
      const occupied = await this.env.DB.prepare("SELECT 1 AS present WHERE EXISTS (SELECT 1 FROM hangout_keys WHERE hangout_id = ?) OR EXISTS (SELECT 1 FROM messages WHERE hangout_id = ?)")
        .bind(this.hangoutId, this.hangoutId).first();
      if (previous || local.size || occupied) throw new Error("key_unavailable");
      const created = await newHangoutKey(await this.kek(1), this.hangoutId!, 1);
      record = created.wrapped;
      // A failed D1 write retries this exact wrapped key; it never invents a replacement.
      await this.ctx.storage.put({ initialized: true, "bootstrap:key": record });
    }
    const guard = {
      sql: "NOT EXISTS (SELECT 1 FROM hangout_keys WHERE hangout_id = ?) AND NOT EXISTS (SELECT 1 FROM messages WHERE hangout_id = ?)",
      args: [this.hangoutId, this.hangoutId],
    };
    await write(this.env.DB, [insert("hangout_keys", ["hangout_id", "epoch"], {
      hangout_id: this.hangoutId, epoch: record.epoch, kek_version: record.kekVersion, wrapped_key: record.wrappedKey, iv: record.iv,
      fingerprint: record.fingerprint, created_at: Date.now(), retired_at: null,
    }, guard)]);
    // Reload the winner instead of trusting our generated key after a competing guarded insert.
    const winner = await this.env.DB.prepare("SELECT epoch, kek_version, iv, wrapped_key, fingerprint FROM hangout_keys WHERE hangout_id = ? AND retired_at IS NULL ORDER BY epoch DESC LIMIT 1")
      .bind(this.hangoutId).first<KeyRow>();
    if (!winner || !validEpoch(winner.epoch)) throw new Error("key_unavailable");
    const wrapped = fromRow(winner);
    await openHangoutKey(await this.kek(wrapped.kekVersion), this.hangoutId!, wrapped);
    await this.ctx.storage.put(`key:${winner.epoch}`, wrapped);
    await this.ctx.storage.delete("bootstrap:key");
    return winner.epoch;
  }

  private async kek(version: number): Promise<CryptoKey> {
    // Only v1 is configured. Never guess a different version for a record.
    if (version !== 1 || !this.env.HANGCORD_KEK_V1) throw new Error("kek_unavailable");
    return importKek(this.env.HANGCORD_KEK_V1);
  }

  private async hangoutKey(epoch: number): Promise<CryptoKey> {
    this.evictExpired();
    const cached = this.cache.get(epoch);
    if (cached) return cached.key;
    const pending = this.inflight.get(epoch);
    if (pending) return pending;
    const task = this.unwrap(epoch).then(async (key) => {
      if (this.cache.size >= MAX_CACHED_EPOCHS) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(epoch, { key, expires: Date.now() + CACHE_MS });
      await this.scheduleEviction();
      return key;
    }).finally(() => { this.inflight.delete(epoch); });
    this.inflight.set(epoch, task);
    return task;
  }

  private async unwrap(epoch: number): Promise<CryptoKey> {
    if (!validEpoch(epoch)) throw new Error("key_integrity");
    const local = await this.ctx.storage.get<WrappedKey>(`key:${epoch}`);
    if (local) {
      // A missing configured KEK is fatal; do not silently fall back to another version.
      const kek = await this.kek(local.kekVersion);
      try {
        if (local.epoch !== epoch) throw new Error("key_integrity");
        return await openHangoutKey(kek, this.hangoutId!, local);
      } catch { /* Source 1 failed authentication: try the D1 backup. */ }
    }
    const row = await this.env.DB.prepare("SELECT epoch, kek_version, iv, wrapped_key, fingerprint FROM hangout_keys WHERE hangout_id = ? AND epoch = ?")
      .bind(this.hangoutId, epoch).first<KeyRow>();
    if (row && row.epoch === epoch) {
      const record = fromRow(row);
      const key = await openHangoutKey(await this.kek(record.kekVersion), this.hangoutId!, record);
      await this.ctx.storage.put({ [`key:${epoch}`]: record, initialized: true });
      console.error("[gateway] authoritative key storage restored from backup; owner review required");
      return key;
    }
    // Member vault recovery is a later slice; no guessed key or silent regeneration is permitted.
    throw new Error("key_unavailable");
  }

  private unavailable(): never {
    console.error("[gateway] message key unavailable; owner review required");
    throw new Error("messages_unavailable");
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [epoch, entry] of this.cache) if (entry.expires <= now) this.cache.delete(epoch);
  }

  private async scheduleEviction(): Promise<void> {
    if (this.cache.size) await this.ctx.storage.setAlarm(Math.min(...[...this.cache.values()].map((entry) => entry.expires)));
  }

  // Alarms wake idle objects for cache cleanup; each crypto call also checks TTL before use.
  // https://developers.cloudflare.com/durable-objects/api/alarms/
  override async alarm(): Promise<void> {
    this.evictExpired();
    await this.scheduleEviction();
  }
}
