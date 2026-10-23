// One Durable Object per room. Hibernation attachments contain identity, never signing keys.
// https://developers.cloudflare.com/durable-objects/best-practices/websockets/
// SQLite transactions/output gates keep the journal, message and sequence durable before ACK.
// https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
import { DurableObject } from "cloudflare:workers";
import {
  BIT, Heartbeat, Identify, MessageCreateRequest, Preferences, SendMessageRequest,
  type HangoutSync, type Message, type MessagesPage,
} from "@hangcord/protocol";
import {
  bitsFor, buildSnapshot, insert, loadHangout, newId, verifySession, write,
  type SessionClaims,
} from "@hangcord/server";
import { HEARTBEAT_INTERVAL_MS, onFrame } from "./session";
import type { Env } from "./index";

const MAX_BYTES = 64 * 1024;
const IDENTIFY_MS = 15_000;
const RETRY_MS = 5_000;
const encoder = new TextEncoder();
interface Attachment { uid: string | null; sid: string | null; exp: number; identified: boolean; deadline: number }
interface StoredMessage extends Record<string, SqlStorageValue> {
  id: string; author_id: string; body_enc: string; epoch: number; created_at: number;
  edited_at: number | null; nonce: string; seq: number;
}
type SendResult = { ok: true; message: Message; seq: number; duplicate: boolean } | { ok: false; error: string; status: number };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export class RoomDO extends DurableObject<Env> {
  private roomId = "";
  private hangoutId = "";
  // All mutations, frame processing and delivery share one pipeline across asynchronous RPCs.
  // Persistent SQL is authoritative; this queue never stores durable data.
  private pending: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS identity (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), room_id TEXT NOT NULL, hangout_id TEXT NOT NULL)");
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, author_id TEXT NOT NULL, body_enc TEXT NOT NULL, epoch INTEGER NOT NULL,
        created_at INTEGER NOT NULL, edited_at INTEGER, nonce TEXT NOT NULL, seq INTEGER NOT NULL UNIQUE,
        UNIQUE(author_id, nonce))`);
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS messages_author_time ON messages(author_id, created_at)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY, message_id TEXT NOT NULL, row_json TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS outbox (message_id TEXT PRIMARY KEY, seq INTEGER NOT NULL)");
      const identity = ctx.storage.sql.exec<{ room_id: string; hangout_id: string }>("SELECT room_id, hangout_id FROM identity WHERE singleton = 1").toArray()[0];
      if (identity) { this.roomId = identity.room_id; this.hangoutId = identity.hangout_id; }
    });
  }

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run);
    this.pending = result.catch(() => undefined);
    return result;
  }

  override async fetch(req: Request): Promise<Response> {
    return this.serial(async () => {
      try {
        const hid = req.headers.get("x-hangout-id");
        const rid = req.headers.get("x-room-id");
        if (!hid || !rid || !/^[a-z0-9_-]{1,64}$/.test(hid) || !/^[a-z0-9_-]{1,64}$/.test(rid)) return json({ error: "bad_request" }, 400);
        if (!this.roomId) {
          this.ctx.storage.sql.exec("INSERT INTO identity (singleton, room_id, hangout_id) VALUES (1, ?, ?)", rid, hid);
          this.roomId = rid; this.hangoutId = hid;
        }
        if (this.roomId !== rid || this.hangoutId !== hid) return json({ error: "not_found" }, 404);
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
          const pair = new WebSocketPair();
          this.ctx.acceptWebSocket(pair[1]);
          pair[1].serializeAttachment({ uid: null, sid: null, exp: 0, identified: false, deadline: Date.now() + IDENTIFY_MS } satisfies Attachment);
          await this.schedule();
          pair[1].send(JSON.stringify({ op: "HELLO", d: { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS } }));
          return new Response(null, { status: 101, webSocket: pair[0] });
        }
        const claims = this.requestClaims(req);
        if (!claims || !await this.active(claims)) return json({ error: "unauthorized" }, 401);
        if (req.method === "GET") return this.history(claims, new URL(req.url));
        if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
        if (req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return json({ error: "json_required" }, 415);
        const raw = await boundedBody(req);
        if (raw === null) return json({ error: "too_large" }, 413);
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { return json({ error: "bad_request" }, 400); }
        const body = SendMessageRequest.safeParse(parsed);
        if (!body.success) return json({ error: "bad_request" }, 400);
        const result = await this.send(claims, body.data.content, body.data.nonce);
        return result.ok ? json(result.message, result.duplicate ? 200 : 201) : json({ error: result.error }, result.status);
      } catch { return json({ error: "unavailable" }, 503); }
    });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    return this.serial(async () => {
      try {
        if (typeof raw !== "string") return this.close(ws, 4002, "bad_frame");
        if (raw.length > MAX_BYTES || encoder.encode(raw).length > MAX_BYTES) return this.close(ws, 4008, "too_large");
        let data: unknown;
        try { data = JSON.parse(raw); } catch { return this.close(ws, 4002, "bad_json"); }
        const op = data && typeof data === "object" ? (data as { op?: unknown }).op : null;
        const att = ws.deserializeAttachment() as Attachment;
        if (!att || (att.identified ? !await this.activeAttachment(att) : att.deadline <= Date.now())) return this.close(ws, 4001, "unauthorized");
        if (op === "HEARTBEAT") {
          if (!Heartbeat.safeParse(data).success) return this.close(ws, 4002, "bad_heartbeat");
          if (att.identified && !await this.visible(att.uid!)) return this.close(ws, 4004, "not_found");
          this.emit(ws, { op: "HEARTBEAT_ACK", d: {} });
          return;
        }
        if (op === "IDENTIFY") {
          if (att.identified) return this.close(ws, 4005, "already_identified");
          const frame = Identify.safeParse(data);
          if (!frame.success) return this.close(ws, 4002, "bad_identify");
          const claims = await verifySession(this.env.SESSION_SIGNING_KEY!, frame.data.d.token);
          if (!claims || !await this.active(claims)) return this.close(ws, 4001, "unauthorized");
          const state = await this.visible(claims.uid);
          if (!state) return this.close(ws, 4004, "not_found");
          const cached = frame.data.d.cache.hangouts[this.hangoutId];
          const sync: HangoutSync = state.hangout.owner_id === claims.uid && cached === state.hangout.version
            ? { kind: "unchanged", version: cached } : { kind: "full", snapshot: buildSnapshot(state) };
          const preferences = await this.prefsSync(claims.uid, frame.data.d.cache.prefsVersion);
          if (!await this.active(claims)) return this.close(ws, 4001, "unauthorized");
          ws.serializeAttachment({ ...claims, uid: claims.uid, identified: true, deadline: claims.exp } satisfies Attachment);
          await this.schedule();
          this.emit(ws, { op: "READY", d: { sessionId: newId(), preferences, hangouts: { [this.hangoutId]: sync } } });
          return;
        }
        if (!att.identified || !att.uid || !att.sid) return this.close(ws, 4003, "not_identified");
        if (op === "MESSAGE_CREATE") {
          const frame = MessageCreateRequest.safeParse(data);
          if (!frame.success) return this.close(ws, 4002, "bad_message_create");
          const { roomId, content, nonce } = frame.data.d;
          const result: SendResult = roomId === this.roomId
            ? await this.send({ uid: att.uid, sid: att.sid, exp: att.exp }, content, nonce, ws)
            : { ok: false, error: "not_found", status: 404 };
          this.emit(ws, { op: "MESSAGE_ACK", d: result.ok
            ? { nonce, ok: true, messageId: result.message.id, seq: result.seq }
            : { nonce, ok: false, error: result.error } });
          return;
        }
        const result = onFrame(raw);
        if (result.close) this.close(ws, result.close.code, result.close.reason);
        else for (const frame of result.reply) this.emit(ws, frame);
      } catch { this.close(ws, 1011, "unavailable"); }
    });
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.close(ws, code === 1005 || code === 1006 ? 1000 : code, "bye");
  }

  override async webSocketError(ws: WebSocket): Promise<void> { this.close(ws, 1011, "unavailable"); }

  private async send(claims: SessionClaims, content: string, nonce: string, source?: WebSocket): Promise<SendResult> {
    if (!await this.active(claims)) return { ok: false, error: "unauthorized", status: 401 };
    const state = await this.visible(claims.uid);
    if (!state) return { ok: false, error: "not_found", status: 404 };
    const bits = bitsFor(state, this.roomId);
    if ((bits & BIT.SEND_MESSAGES) === 0n) return { ok: false, error: "forbidden", status: 403 };
    const prior = this.ctx.storage.sql.exec<StoredMessage>("SELECT * FROM messages WHERE author_id = ? AND nonce = ?", claims.uid, nonce).toArray()[0];
    if (prior) {
      const [message] = await this.open(claims.uid, [prior], true);
      if (!message || message.content !== content) return { ok: false, error: "nonce_conflict", status: 409 };
      if (!await this.active(claims)) return { ok: false, error: "unauthorized", status: 401 };
      return { ok: true, message, seq: prior.seq, duplicate: true };
    }
    const now = Date.now();
    const recent = this.ctx.storage.sql.exec<{ count: number; last: number | null }>(
      "SELECT COUNT(CASE WHEN created_at > ? THEN 1 END) AS count, MAX(created_at) AS last FROM messages WHERE author_id = ? AND created_at > ?",
      now - 5000, claims.uid, now - 21_600_000,
    ).one();
    if (recent.count >= 5) return { ok: false, error: "rate_limited", status: 429 };
    const configuredSlowmode = state.rooms.find((r) => r.id === this.roomId)?.settings?.slowmode;
    const slowmode = typeof configuredSlowmode === "number" ? configuredSlowmode : 0;
    if ((bits & BIT.BYPASS_SLOWMODE) === 0n && recent.last !== null && now < recent.last + slowmode * 1000) return { ok: false, error: "slowmode", status: 429 };
    const id = newId();
    const sealed = await this.keyObject().sealMessage(this.hangoutId, this.roomId, claims.uid, id, content);
    if (!await this.active(claims)) return { ok: false, error: "unauthorized", status: 401 };
    // Arm retry before the commit so a crash immediately after commit cannot strand its outbox.
    await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
    const row = { id, hangout_id: this.hangoutId, room_id: this.roomId, author_id: claims.uid, body_enc: sealed.bodyEnc, epoch: sealed.epoch, created_at: now, edited_at: null, deleted_at: null };
    const seq = this.ctx.storage.transactionSync(() => {
      const next = this.ctx.storage.sql.exec<{ seq: number }>("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM messages").one().seq;
      this.ctx.storage.sql.exec("INSERT INTO journal (seq, message_id, row_json) VALUES (?, ?, ?)", next, id, JSON.stringify({ ...row, nonce, seq: next }));
      this.ctx.storage.sql.exec("INSERT INTO messages (id, author_id, body_enc, epoch, created_at, edited_at, nonce, seq) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)", id, claims.uid, sealed.bodyEnc, sealed.epoch, now, nonce, next);
      this.ctx.storage.sql.exec("INSERT INTO outbox (message_id, seq) VALUES (?, ?)", id, next);
      return next;
    });
    const message: Message = { id, hangoutId: this.hangoutId, roomId: this.roomId, authorId: claims.uid, content, createdAt: now, editedAt: null };
    // Individual delivery failure never changes a durable acceptance into a failed ACK.
    await this.broadcast(message, nonce, seq, source);
    this.ctx.waitUntil(this.serial(async () => { await this.flush(); await this.schedule(); }).catch(() => undefined));
    return { ok: true, message, seq, duplicate: false };
  }

  private async broadcast(message: Message, nonce: string, seq: number, source?: WebSocket): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const att = ws.deserializeAttachment() as Attachment;
        if (!att?.identified) continue;
        if (!await this.activeAttachment(att)) { this.close(ws, 4001, "unauthorized"); continue; }
        if (!await this.visible(att.uid!)) { this.close(ws, 4004, "not_found"); continue; }
        // Recheck expiry after the access read, immediately before emitting plaintext.
        if (!await this.activeAttachment(att)) { this.close(ws, 4001, "unauthorized"); continue; }
        this.emit(ws, { op: "MESSAGE_CREATE", d: ws === source || att.uid === message.authorId ? { message, nonce } : { message }, s: seq });
      } catch { this.close(ws, 1011, "unavailable"); }
    }
  }

  private async history(claims: SessionClaims, url: URL): Promise<Response> {
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    const rawLimit = url.searchParams.get("limit");
    if ([...url.searchParams.keys()].some((key) => !["before", "after", "limit"].includes(key) || url.searchParams.getAll(key).length !== 1)) return json({ error: "bad_request" }, 400);
    if ((before !== null && after !== null) || (rawLimit !== null && !/^[1-9][0-9]{0,2}$/.test(rawLimit))) return json({ error: "bad_request" }, 400);
    const limit = rawLimit === null ? 50 : Number(rawLimit);
    if (limit > 100) return json({ error: "bad_request" }, 400);
    if ((before !== null && !/^[a-z0-9_-]{1,64}$/.test(before)) || (after !== null && !/^[a-z0-9_-]{1,64}$/.test(after))) return json({ error: "bad_cursor" }, 400);
    const state = await this.visible(claims.uid);
    if (!state) return json({ error: "not_found" }, 404);
    if ((bitsFor(state, this.roomId) & BIT.READ_HISTORY) === 0n) return json({ error: "forbidden" }, 403);
    const cursorId = before ?? after;
    const cursor = cursorId ? this.ctx.storage.sql.exec<{ seq: number }>("SELECT seq FROM messages WHERE id = ?", cursorId).toArray()[0] : undefined;
    if (cursorId && !cursor) return json({ error: "bad_cursor" }, 400);
    const rows = cursor
      ? this.ctx.storage.sql.exec<StoredMessage>(`SELECT * FROM messages WHERE seq ${after !== null ? ">" : "<"} ? ORDER BY seq ${after !== null ? "ASC" : "DESC"} LIMIT ?`, cursor.seq, limit + 1).toArray()
      : this.ctx.storage.sql.exec<StoredMessage>("SELECT * FROM messages ORDER BY seq DESC LIMIT ?", limit + 1).toArray();
    const selected = rows.slice(0, limit);
    if (after === null) selected.reverse();
    const messages = await this.open(claims.uid, selected);
    if (!await this.active(claims)) return json({ error: "unauthorized" }, 401);
    return json({ messages, hasMore: rows.length > limit } satisfies MessagesPage);
  }

  private async open(uid: string, rows: StoredMessage[], ownOnly = false): Promise<Message[]> {
    if (!rows.length) return [];
    const bodies: string[] = [];
    // Cryptographic work is capped at 50 messages per RPC (ACCESS_AND_SETTINGS §10.6 H).
    for (let i = 0; i < rows.length; i += 50) {
      bodies.push(...await this.keyObject().openMessages(this.hangoutId, this.roomId, uid,
        rows.slice(i, i + 50).map((row) => ({ id: row.id, authorId: row.author_id, bodyEnc: row.body_enc, epoch: row.epoch })), ownOnly));
    }
    if (bodies.length !== rows.length) throw new Error("unavailable");
    return rows.map((row, i) => ({ id: row.id, roomId: this.roomId, hangoutId: this.hangoutId, authorId: row.author_id, content: bodies[i]!, createdAt: row.created_at, editedAt: row.edited_at }));
  }

  /** Bounded retries use the same id and a shared D1 guard for both journal and insert. */
  private async flush(): Promise<void> {
    const rows = this.ctx.storage.sql.exec<{ message_id: string; row_json: string }>("SELECT o.message_id, j.row_json FROM outbox o JOIN journal j ON j.seq = o.seq ORDER BY o.seq LIMIT 25").toArray();
    for (const item of rows) {
      const row = JSON.parse(item.row_json) as Record<string, unknown>;
      await write(this.env.DB, [insert("messages", ["id"], row, { sql: "NOT EXISTS (SELECT 1 FROM messages WHERE id = ?)", args: [item.message_id] })]);
      const persisted = await this.env.DB.prepare("SELECT body_enc, epoch, room_id, hangout_id, author_id FROM messages WHERE id = ?").bind(item.message_id)
        .first<{ body_enc: string; epoch: number; room_id: string; hangout_id: string; author_id: string }>();
      if (!persisted || persisted.body_enc !== row.body_enc || persisted.epoch !== row.epoch || persisted.room_id !== row.room_id || persisted.hangout_id !== row.hangout_id || persisted.author_id !== row.author_id) throw new Error("unavailable");
      // Never truncate the local journal until ciphertext has been read back from D1.
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("DELETE FROM outbox WHERE message_id = ?", item.message_id);
        this.ctx.storage.sql.exec("DELETE FROM journal WHERE message_id = ?", item.message_id);
      });
    }
  }

  override async alarm(): Promise<void> {
    return this.serial(async () => {
      try { await this.flush(); } catch { /* The durable outbox and next alarm preserve retries. */ }
      for (const ws of this.ctx.getWebSockets()) {
        const att = ws.deserializeAttachment() as Attachment;
        if (!att || (att.identified ? att.exp : att.deadline) <= Date.now()) this.close(ws, 4001, "unauthorized");
      }
      await this.schedule();
    });
  }

  private async schedule(): Promise<void> {
    let next = this.ctx.storage.sql.exec("SELECT 1 FROM outbox LIMIT 1").toArray().length ? Date.now() + RETRY_MS : Infinity;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att) {
        const expiry = att.identified ? att.exp : att.deadline;
        if (expiry > Date.now()) next = Math.min(next, expiry);
      }
    }
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAlarm();
  }

  private keyObject() { return this.env.HANGOUTS.get(this.env.HANGOUTS.idFromName(this.hangoutId)); }
  private async active(claims: SessionClaims): Promise<boolean> {
    const now = Date.now();
    return Number.isSafeInteger(claims.exp) && claims.exp > now && await this.env.USERS.get(this.env.USERS.idFromName(claims.uid)).isActive(claims.sid, now);
  }
  private activeAttachment(att: Attachment) {
    return att.uid && att.sid ? this.active({ uid: att.uid, sid: att.sid, exp: att.exp }) : Promise.resolve(false);
  }
  private requestClaims(req: Request): SessionClaims | null {
    const uid = req.headers.get("x-uid"), sid = req.headers.get("x-sid"), exp = Number(req.headers.get("x-exp"));
    return uid && sid && Number.isSafeInteger(exp) && exp > 0 ? { uid, sid, exp } : null;
  }
  private async visible(uid: string) {
    const state = await loadHangout(this.env.DB, this.hangoutId, uid);
    return state && state.rooms.some((r) => r.id === this.roomId && r.type !== "category") && (bitsFor(state, this.roomId) & BIT.VIEW_ROOM) !== 0n ? state : null;
  }
  private async prefsSync(uid: string, have: number) {
    const row = await this.env.DB.prepare("SELECT version, prefs_json FROM user_prefs WHERE user_id = ?").bind(uid).first<{ version: number; prefs_json: string }>();
    const preferences = Preferences.parse(row ? { version: row.version, values: JSON.parse(row.prefs_json) } : { version: 0, values: {} });
    return preferences.version === have ? { kind: "unchanged" as const, version: have } : { kind: "full" as const, preferences };
  }
  private emit(ws: WebSocket, frame: unknown): void { try { ws.send(JSON.stringify(frame)); } catch { /* Disconnected peer; durable state is unchanged. */ } }
  private close(ws: WebSocket, code: number, reason: string): void { try { ws.close(code, reason); } catch { /* Already closed. */ } }
}

async function boundedBody(req: Request): Promise<string | null> {
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(all); } catch { return ""; }
}
