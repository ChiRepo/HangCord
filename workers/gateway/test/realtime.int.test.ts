// Realtime integration: API + gateway Workers on local workerd sharing one local D1.
// Sign in → create hangout → open sockets → IDENTIFY → READY → MESSAGE_CREATE → broadcast + ACK → history.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { HangoutSnapshot, MessagesPage, Message, Session } from "@hangcord/protocol";
import { SESSION_KEY, client, d1, idToken, migrate, newPersistDir, startApi } from "../../api/test/helpers";

const here = dirname(fileURLToPath(import.meta.url));
const persist = newPersistDir();
const KEK = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"); // test-only

let apiW: Unstable_DevWorker, gwW: Unstable_DevWorker;
let api: ReturnType<typeof client>, gw: ReturnType<typeof client>;

const signIn = async (sub: string) => {
  const r = await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: idToken({ sub, name: sub }) }) });
  expect(r.status).toBe(200);
  return Session.parse(await r.json());
};

/** A small socket client that queues frames so tests can await the next one. */
async function socket(hangoutId: string) {
  const ws = new WebSocket(`ws://${gwW.address}:${gwW.port}/v1/gateway?hangout=${hangoutId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test frames are checked field by field
  const frames: Array<{ op: string; d: any; s?: number }> = [];
  const waiters: Array<() => void> = [];
  let closed: { code: number; reason: string } | null = null;
  ws.addEventListener("message", (e) => { frames.push(JSON.parse(String(e.data))); waiters.splice(0).forEach((f) => f()); });
  ws.addEventListener("close", (e) => { closed = { code: e.code, reason: e.reason }; waiters.splice(0).forEach((f) => f()); });
  await new Promise<void>((res, rej) => { ws.addEventListener("open", () => res()); ws.addEventListener("error", () => rej(new Error("ws error"))); });
  const next = async (op?: string, ms = 5000) => {
    const end = Date.now() + ms;
    for (;;) {
      const i = frames.findIndex((f) => !op || f.op === op);
      if (i >= 0) return frames.splice(i, 1)[0]!;
      if (closed) throw new Error(`closed ${closed.code} ${closed.reason}`);
      if (Date.now() > end) throw new Error(`timeout waiting for ${op}`);
      await new Promise<void>((r) => { waiters.push(r); setTimeout(r, 100); });
    }
  };
  const send = (f: unknown) => ws.send(JSON.stringify(f));
  const closedWith = async (ms = 5000) => { const end = Date.now() + ms; while (!closed && Date.now() < end) await new Promise((r) => setTimeout(r, 50)); return closed; };
  return { ws, next, send, closedWith, frames };
}

const identify = (token: string, hangouts: Record<string, number> = {}) =>
  ({ op: "IDENTIFY", d: { token, client: { platform: "desktop", version: "test" }, cache: { prefsVersion: 0, hangouts } } });

let owner: Session, friend: Session, stranger: Session;
let hangoutId: string, general: string, secret: string;

beforeAll(async () => {
  migrate(persist);
  apiW = await startApi(persist);
  gwW = await unstable_dev(join(here, "../src/index.ts"), {
    config: join(here, "wrangler.test.toml"), persistTo: persist, logLevel: "none",
    vars: { SESSION_SIGNING_KEY: SESSION_KEY, HANGCORD_KEK_V1: KEK },
    experimental: { disableExperimentalWarning: true },
  });
  api = client(apiW); gw = client(gwW);
  owner = await signIn("owner-uid"); friend = await signIn("friend-uid"); stranger = await signIn("stranger-uid");
  hangoutId = ((await (await api("/hangouts", { method: "POST", token: owner.session, body: JSON.stringify({ name: "Night Owls" }) })).json()) as { id: string }).id;
  const snap = HangoutSnapshot.parse(await (await api(`/hangouts/${hangoutId}/snapshot`, { token: owner.session })).json());
  general = snap.rooms.find((r) => r.name === "general")!.id;
  const cat = snap.rooms.find((r) => r.type === "category")!.id;
  // A private room: @everyone can't VIEW it (own guidelines with a deny override).
  const r = await api(`/hangouts/${hangoutId}/rooms`, { method: "POST", token: owner.session, body: JSON.stringify({
    type: "text", name: "mods-only", categoryId: cat, guidelines: "own", overrides: [{ targetType: "role", targetId: hangoutId, allow: "0", deny: "1" }],
  }) });
  expect(r.status).toBe(201);
  secret = ((await r.json()) as { id: string }).id;
  // Invites come later — add the friend as a plain member directly.
  d1(persist, `INSERT INTO members (hangout_id, user_id, roles_json, joined_at, flags) VALUES ('${hangoutId}', 'friend-uid', '[]', 0, 0)`);
}, 180_000);
afterAll(async () => { await gwW?.stop(); await apiW?.stop(); });

describe("gateway realtime (cp-002.1)", () => {
  it("HELLO → IDENTIFY → READY with a full snapshot, then 'unchanged' when the cache is current", async () => {
    const a = await socket(hangoutId);
    expect((await a.next("HELLO")).d.heartbeatIntervalMs).toBeGreaterThanOrEqual(5000);
    a.send(identify(owner.session));
    const ready = await a.next("READY");
    const sync = ready.d.hangouts[hangoutId];
    expect(sync.kind).toBe("full");
    const version = HangoutSnapshot.parse(sync.snapshot).version;
    a.ws.close();

    const b = await socket(hangoutId);
    await b.next("HELLO");
    b.send(identify(owner.session, { [hangoutId]: version }));
    expect((await b.next("READY")).d.hangouts[hangoutId]).toEqual({ kind: "unchanged", version });
    b.send({ op: "HEARTBEAT", d: { seq: null } });
    expect((await b.next("HEARTBEAT_ACK")).d).toEqual({});
    b.ws.close();
  });

  it("refuses: bad token (4001), non-member (4004), messages before IDENTIFY (4003), server-only ops (4002)", async () => {
    const a = await socket(hangoutId); await a.next("HELLO");
    a.send(identify("hc1.bad.token")); expect((await a.closedWith())?.code).toBe(4001);
    const b = await socket(hangoutId); await b.next("HELLO");
    b.send(identify(stranger.session)); expect((await b.closedWith())?.code).toBe(4004);
    const c = await socket(hangoutId); await c.next("HELLO");
    c.send({ op: "MESSAGE_CREATE", d: { roomId: general, content: "hi", nonce: "nonce-0001" } }); expect((await c.closedWith())?.code).toBe(4003);
    const d = await socket(hangoutId); await d.next("HELLO");
    d.send(identify(owner.session)); await d.next("READY");
    d.send({ op: "SYSTEM_NOTICE", d: { code: "x", message: "y" } }); expect((await d.closedWith())?.code).toBe(4002);
  });

  it("a message reaches every member who can see the room; the sender gets an ACK + its nonce", async () => {
    const o = await socket(hangoutId); await o.next("HELLO"); o.send(identify(owner.session)); await o.next("READY");
    const f = await socket(hangoutId); await f.next("HELLO"); f.send(identify(friend.session)); await f.next("READY");

    o.send({ op: "MESSAGE_CREATE", d: { roomId: general, content: "hello night owls 🦉", nonce: "nonce-0002" } });
    const ack = await o.next("MESSAGE_ACK");
    expect(ack.d).toMatchObject({ nonce: "nonce-0002", ok: true });
    const mine = await o.next("MESSAGE_CREATE");
    expect(mine.d.nonce).toBe("nonce-0002");
    const theirs = await f.next("MESSAGE_CREATE");
    expect(Message.parse(theirs.d.message)).toMatchObject({ content: "hello night owls 🦉", authorId: "owner-uid", roomId: general });
    expect(theirs.d.nonce).toBeUndefined();

    // the friend can't see #mods-only: no broadcast to them, and their send there is refused
    o.send({ op: "MESSAGE_CREATE", d: { roomId: secret, content: "mods only", nonce: "nonce-0003" } });
    expect((await o.next("MESSAGE_ACK")).d.ok).toBe(true);
    await o.next("MESSAGE_CREATE");
    await new Promise((r) => setTimeout(r, 400));
    expect(f.frames.filter((x) => x.op === "MESSAGE_CREATE")).toHaveLength(0);
    f.send({ op: "MESSAGE_CREATE", d: { roomId: secret, content: "let me in", nonce: "nonce-0004" } });
    expect((await f.next("MESSAGE_ACK")).d).toEqual({ nonce: "nonce-0004", ok: false, error: "not_found" });
    o.ws.close(); f.ws.close();
  });

  it("a retry with the same nonce never posts twice; flooding is rate-limited", async () => {
    const o = await socket(hangoutId); await o.next("HELLO"); o.send(identify(friend.session)); await o.next("READY");
    o.send({ op: "MESSAGE_CREATE", d: { roomId: general, content: "once", nonce: "nonce-dup-1" } });
    const a1 = await o.next("MESSAGE_ACK");
    o.send({ op: "MESSAGE_CREATE", d: { roomId: general, content: "once", nonce: "nonce-dup-1" } });
    const a2 = await o.next("MESSAGE_ACK");
    expect(a2.d.messageId).toBe(a1.d.messageId);
    const acks = [];
    for (let i = 0; i < 6; i++) o.send({ op: "MESSAGE_CREATE", d: { roomId: general, content: `spam ${i}`, nonce: `nonce-spam-${i}` } });
    for (let i = 0; i < 6; i++) acks.push((await o.next("MESSAGE_ACK")).d);
    expect(acks.some((x) => x.ok === false && x.error === "rate_limited")).toBe(true);
    o.ws.close();
  });

  it("REST history (newest last, paged) and fallback send; bodies are encrypted in D1", async () => {
    const send = await gw(`/rooms/${general}/messages`, { method: "POST", token: owner.session, body: JSON.stringify({ content: "via REST", nonce: "nonce-rest-1" }) });
    expect(send.status).toBe(201);
    const page = MessagesPage.parse(await (await gw(`/rooms/${general}/messages?limit=2`, { token: friend.session })).json());
    expect(page.messages).toHaveLength(2);
    expect(page.messages.at(-1)!.content).toBe("via REST");
    expect(page.hasMore).toBe(true);
    const older = MessagesPage.parse(await (await gw(`/rooms/${general}/messages?limit=100&before=${page.messages[0]!.id}`, { token: friend.session })).json());
    expect(older.messages.length).toBeGreaterThan(0);
    expect(older.messages.every((m) => m.createdAt <= page.messages[0]!.createdAt)).toBe(true);

    expect((await gw(`/rooms/${secret}/messages`, { token: friend.session })).status).toBe(404);
    expect((await gw(`/rooms/${general}/messages`, { token: stranger.session })).status).toBe(404);
    expect((await gw(`/rooms/${general}/messages`)).status).toBe(401);

    await new Promise((r) => setTimeout(r, 500)); // background D1 persist
    const rows = d1(persist, `SELECT body_enc FROM messages WHERE room_id = '${general}'`);
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(String(r.body_enc)).toMatch(/^v1\./);
    expect(rows.some((r) => String(r.body_enc).includes("night owls"))).toBe(false);
    expect(d1(persist, `SELECT COUNT(*) AS n FROM hangout_keys WHERE hangout_id = '${hangoutId}'`)[0]!.n).toBe(1);
    expect(d1(persist, `SELECT COUNT(*) AS n FROM journal WHERE tbl = 'messages'`)[0]!.n).toBe(d1(persist, "SELECT COUNT(*) AS n FROM messages")[0]!.n);
  });
});
