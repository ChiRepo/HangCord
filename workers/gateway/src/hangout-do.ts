// HangoutDO — one per hangout (idFromName(hangoutId)): live sockets of its members (Hibernation API),
// the hot copy of its messages (DO SQLite, bodies encrypted) and its hangout key (MASTER_PLAN §5.2, §8.2).
// Order for every message: check → store (DO SQLite) → broadcast + ACK → persist to D1 in the background.
// Delivery never waits on D1 (§8.2 step 1); the D1 write is journaled like every write.
import { DurableObject } from "cloudflare:workers";
import {
  BIT, Identify, MAX_MESSAGE_CHARS, MessageCreateRequest, SendMessageRequest,
  type HangoutSync, type Message, type MessagesPage, type Preferences,
} from "@hangcord/protocol";
import {
  bitsFor, buildSnapshot, importKek, insert, loadHangout, newHangoutKey, newId, openBody, openHangoutKey, roomKey, sealBody,
  verifySession, write, type HangoutState, type WrappedKey,
} from "@hangcord/server";
import { HEARTBEAT_INTERVAL_MS, onFrame } from "./session";
import type { Env } from "./index";

const MAX_FRAME_BYTES = 64 * 1024;
const STATE_TTL_MS = 10_000;
const RATE = { max: 5, windowMs: 5_000 };
const EPOCH = 1; // key rotation (new epochs) arrives with ACCESS_AND_SETTINGS §10.5

interface Attachment { uid: string | null; identified: boolean }
type Out = { op: string; d: unknown; s?: number };

export class HangoutDO extends DurableObject<Env> {
  private hangoutId: string | null = null;
  private hsk: CryptoKey | null = null;
  private keys = new Map<string, CryptoKey>();
  private states = new Map<string, { s: HangoutState | null; at: number }>();
  private sent = new Map<string, number[]>();
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL, author_id TEXT NOT NULL, body_enc TEXT NOT NULL, epoch INTEGER NOT NULL,
        created_at INTEGER NOT NULL, edited_at INTEGER, nonce TEXT NOT NULL, UNIQUE (author_id, nonce))`);
      this.ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS messages_by_room ON messages(room_id, created_at, id)");
      this.hangoutId = (await this.ctx.storage.get<string>("hangoutId")) ?? null;
      this.seq = (await this.ctx.storage.get<number>("seq")) ?? 0;
    });
  }

  // ------------------------------------------------------------------ entry from the Worker

  override async fetch(req: Request): Promise<Response> {
    const hid = req.headers.get("x-hangout-id");
    if (!hid) return new Response(null, { status: 400 });
    if (!this.hangoutId) { this.hangoutId = hid; await this.ctx.storage.put("hangoutId", hid); }
    if (this.hangoutId !== hid) return new Response(null, { status: 409 });

    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ uid: null, identified: false } satisfies Attachment);
      pair[1].send(JSON.stringify({ op: "HELLO", d: { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS } }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const uid = req.headers.get("x-uid")!;
    const roomId = req.headers.get("x-room-id")!;
    if (req.method === "GET") {
      const url = new URL(req.url);
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);
      return this.history(uid, roomId, url.searchParams.get("before"), limit);
    }
    const body = SendMessageRequest.safeParse(await req.json().catch(() => null));
    if (!body.success) return json({ error: "bad_request" }, 400);
    const r = await this.send(uid, roomId, body.data.content, body.data.nonce);
    return r.ok ? json(r.message, 201) : json({ error: r.error }, r.error === "not_found" ? 404 : r.error === "rate_limited" ? 429 : 403);
  }

  // ------------------------------------------------------------------ sockets

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === "string" ? raw : "";
    if (text.length > MAX_FRAME_BYTES || new TextEncoder().encode(text).length > MAX_FRAME_BYTES) return ws.close(4008, "too_large");
    let data: unknown;
    try { data = JSON.parse(text); } catch { return ws.close(4002, "bad_json"); }
    const op = (data as { op?: unknown })?.op;
    const att = ws.deserializeAttachment() as Attachment;

    if (op === "HEARTBEAT") return ws.send(JSON.stringify({ op: "HEARTBEAT_ACK", d: {} }));
    if (op === "IDENTIFY") {
      if (att.identified) return ws.close(4005, "already_identified");
      const f = Identify.safeParse(data);
      if (!f.success) return ws.close(4002, "bad_identify");
      const claims = await verifySession(this.env.SESSION_SIGNING_KEY!, f.data.d.token);
      if (!claims) return ws.close(4001, "unauthorized");
      const s = await this.state(claims.uid, true);
      if (!s) return ws.close(4004, "not_member");
      ws.serializeAttachment({ uid: claims.uid, identified: true } satisfies Attachment);
      const cached = f.data.d.cache.hangouts[this.hangoutId!];
      const sync: HangoutSync = cached === s.hangout.version ? { kind: "unchanged", version: cached } : { kind: "full", snapshot: buildSnapshot(s) };
      return ws.send(JSON.stringify({
        op: "READY",
        d: { sessionId: newId(), preferences: await this.prefsSync(claims.uid, f.data.d.cache.prefsVersion), hangouts: { [this.hangoutId!]: sync } },
      }));
    }
    if (!att.identified || !att.uid) return ws.close(4003, "not_identified");
    if (op === "MESSAGE_CREATE") {
      const f = MessageCreateRequest.safeParse(data);
      if (!f.success) return ws.close(4002, "bad_message_create");
      const { roomId, content, nonce } = f.data.d;
      const r = await this.send(att.uid, roomId, content, nonce, ws);
      ws.send(JSON.stringify(r.ok ? { op: "MESSAGE_ACK", d: { nonce, ok: true, messageId: r.message.id } } : { op: "MESSAGE_ACK", d: { nonce, ok: false, error: r.error } }));
      return;
    }
    // Everything else: contract checks (junk / server-only → 4002, not built yet → 4003).
    const r = onFrame(text);
    if (r.close) return ws.close(r.close.code, r.close.reason);
    for (const out of r.reply) ws.send(JSON.stringify(out));
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch { /* already closed */ }
  }

  // ------------------------------------------------------------------ messages

  private async send(uid: string, roomId: string, content: string, nonce: string, from?: WebSocket):
    Promise<{ ok: true; message: Message } | { ok: false; error: string }> {
    const s = await this.state(uid);
    if (!s) return { ok: false, error: "not_found" };
    const room = s.rooms.find((r) => r.id === roomId);
    if (!room || room.type === "category") return { ok: false, error: "not_found" };
    const bits = bitsFor(s, roomId);
    if ((bits & BIT.VIEW_ROOM) === 0n) return { ok: false, error: "not_found" };
    if ((bits & BIT.SEND_MESSAGES) === 0n) return { ok: false, error: "forbidden" };
    if (content.trim().length === 0 || content.length > MAX_MESSAGE_CHARS) return { ok: false, error: "bad_content" };

    // Same nonce again (a retry) → the original message, never a second copy.
    const dup = this.ctx.storage.sql.exec("SELECT id FROM messages WHERE author_id = ? AND nonce = ?", uid, nonce).toArray()[0];
    if (dup) {
      const m = await this.load(String(dup.id));
      return m ? { ok: true, message: m } : { ok: false, error: "not_found" };
    }
    if (!this.allow(uid)) return { ok: false, error: "rate_limited" };

    const now = Date.now();
    const id = newId();
    const ids = { hangoutId: this.hangoutId!, roomId, messageId: id, epoch: EPOCH };
    const body = await sealBody(await this.roomKey(roomId), ids, content);
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, room_id, author_id, body_enc, epoch, created_at, edited_at, nonce) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)",
      id, roomId, uid, body, EPOCH, now, nonce,
    );
    const message: Message = { id, roomId, hangoutId: this.hangoutId!, authorId: uid, content, createdAt: now, editedAt: null };
    await this.broadcast(message, nonce, from);
    // Persist in the background, journaled (MASTER_PLAN §8.2). Failure leaves the hot copy + retry later.
    this.ctx.waitUntil(write(this.env.DB, [insert("messages", ["id"], {
      id, hangout_id: this.hangoutId!, room_id: roomId, author_id: uid, body_enc: body, epoch: EPOCH, created_at: now, edited_at: null, deleted_at: null,
    })], now).catch(() => console.error("[gateway] message persist failed; kept in HangoutDO")));
    return { ok: true, message };
  }

  private async broadcast(message: Message, nonce: string, from?: WebSocket) {
    const s = ++this.seq;
    await this.ctx.storage.put("seq", s);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (!att.identified || !att.uid) continue;
      const st = await this.state(att.uid);
      if (!st || (bitsFor(st, message.roomId) & BIT.VIEW_ROOM) === 0n) continue;
      const out: Out = { op: "MESSAGE_CREATE", d: ws === from || att.uid === message.authorId ? { message, nonce } : { message }, s };
      try { ws.send(JSON.stringify(out)); } catch { /* socket went away */ }
    }
  }

  private async history(uid: string, roomId: string, before: string | null, limit: number): Promise<Response> {
    const s = await this.state(uid);
    const bits = s ? bitsFor(s, roomId) : 0n;
    if (!s || (bits & BIT.VIEW_ROOM) === 0n) return json({ error: "not_found" }, 404);
    if ((bits & BIT.READ_HISTORY) === 0n) return json({ messages: [], hasMore: false } satisfies MessagesPage, 200);
    const cursor = before ? this.ctx.storage.sql.exec("SELECT created_at, id FROM messages WHERE id = ? AND room_id = ?", before, roomId).toArray()[0] : undefined;
    const rows = cursor
      ? this.ctx.storage.sql.exec("SELECT * FROM messages WHERE room_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?", roomId, cursor.created_at, cursor.created_at, cursor.id, limit + 1).toArray()
      : this.ctx.storage.sql.exec("SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", roomId, limit + 1).toArray();
    const page = await Promise.all(rows.slice(0, limit).map((r) => this.toMessage(r)));
    return json({ messages: page.reverse(), hasMore: rows.length > limit } satisfies MessagesPage, 200);
  }

  private async load(id: string): Promise<Message | null> {
    const r = this.ctx.storage.sql.exec("SELECT * FROM messages WHERE id = ?", id).toArray()[0];
    return r ? this.toMessage(r) : null;
  }

  private async toMessage(r: Record<string, SqlStorageValue>): Promise<Message> {
    const roomId = String(r.room_id);
    const content = await openBody(await this.roomKey(roomId), { hangoutId: this.hangoutId!, roomId, messageId: String(r.id), epoch: Number(r.epoch) }, String(r.body_enc));
    return { id: String(r.id), roomId, hangoutId: this.hangoutId!, authorId: String(r.author_id), content, createdAt: Number(r.created_at), editedAt: r.edited_at === null ? null : Number(r.edited_at) };
  }

  // ------------------------------------------------------------------ helpers

  /** Member state per user, cached briefly; fail closed (null) if D1 can't answer. */
  private async state(uid: string, fresh = false): Promise<HangoutState | null> {
    const c = this.states.get(uid);
    if (!fresh && c && Date.now() - c.at < STATE_TTL_MS) return c.s;
    const s = await loadHangout(this.env.DB, this.hangoutId!, uid).catch(() => null);
    this.states.set(uid, { s, at: Date.now() });
    return s;
  }

  private allow(uid: string): boolean {
    const now = Date.now();
    const recent = (this.sent.get(uid) ?? []).filter((t) => now - t < RATE.windowMs);
    if (recent.length >= RATE.max) { this.sent.set(uid, recent); return false; }
    recent.push(now);
    this.sent.set(uid, recent);
    return true;
  }

  private async hangoutKey(): Promise<CryptoKey> {
    if (this.hsk) return this.hsk;
    const kek = await importKek(this.env.HANGCORD_KEK_V1!);
    let w = await this.ctx.storage.get<WrappedKey>(`key:${EPOCH}`);
    if (!w) {
      const row = await this.env.DB.prepare("SELECT epoch, kek_version, iv, wrapped_key, fingerprint FROM hangout_keys WHERE hangout_id = ? AND epoch = ?")
        .bind(this.hangoutId, EPOCH).first<{ epoch: number; kek_version: number; iv: string; wrapped_key: string; fingerprint: string }>();
      if (row) w = { epoch: row.epoch, kekVersion: row.kek_version, iv: row.iv, wrapped: row.wrapped_key, fingerprint: row.fingerprint };
    }
    if (w) {
      this.hsk = await openHangoutKey(kek, this.hangoutId!, w);
    } else {
      const created = await newHangoutKey(kek, this.hangoutId!, EPOCH);
      w = created.wrapped;
      // Authoritative copy in D1 first (journaled, fails closed), then the DO copy.
      await write(this.env.DB, [insert("hangout_keys", ["hangout_id", "epoch"], {
        hangout_id: this.hangoutId!, epoch: w.epoch, kek_version: w.kekVersion, wrapped_key: w.wrapped, iv: w.iv, fingerprint: w.fingerprint, created_at: Date.now(), retired_at: null,
      })]);
      this.hsk = created.hsk;
    }
    await this.ctx.storage.put(`key:${EPOCH}`, w);
    return this.hsk;
  }

  private async roomKey(roomId: string): Promise<CryptoKey> {
    let k = this.keys.get(roomId);
    if (!k) { k = await roomKey(await this.hangoutKey(), roomId); this.keys.set(roomId, k); }
    return k;
  }

  private async prefsSync(uid: string, have: number): Promise<{ kind: "unchanged"; version: number } | { kind: "full"; preferences: Preferences }> {
    const row = await this.env.DB.prepare("SELECT version, prefs_json FROM user_prefs WHERE user_id = ?").bind(uid).first<{ version: number; prefs_json: string }>();
    const p: Preferences = row ? { version: row.version, values: JSON.parse(row.prefs_json) as Preferences["values"] } : { version: 0, values: {} };
    return p.version === have ? { kind: "unchanged", version: have } : { kind: "full", preferences: p };
  }
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
