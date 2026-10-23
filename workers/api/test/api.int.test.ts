// Integration tests: the real Worker (test entry) on local workerd with a real local D1 + Durable Objects.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, createSign, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { HangoutSnapshot, Preferences, Room, Session, BIT } from "@hangcord/protocol";

const here = dirname(fileURLToPath(import.meta.url));
const config = join(here, "wrangler.test.toml");
const persist = mkdtempSync(join(tmpdir(), "hc-api-"));
const PROJECT = "hangcord-test";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** A Firebase-shaped ID token signed with the test key. */
function idToken(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: typeof privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "alice-uid", iat: now, auth_time: now, exp: now + 3600,
    email: "alice@example.test", email_verified: true, name: "Alice", firebase: { sign_in_provider: "google.com" }, ...claims,
  };
  const head = b64({ alg: "RS256", kid: opts.kid ?? "test-kid", typ: "JWT" });
  const body = b64(payload);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(opts.key ?? privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

let w: Unstable_DevWorker;
const api = (path: string, init: RequestInit & { token?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body) headers.set("content-type", "application/json");
  return w.fetch(`http://api.test/v1${path}`, { ...init, headers } as never) as unknown as Promise<Response>;
};
const signIn = async (claims: Record<string, unknown> = {}) => {
  const r = await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: idToken(claims) }) });
  expect(r.status).toBe(200);
  return Session.parse(await r.json());
};

beforeAll(async () => {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "hangcord-test", "--local", "--persist-to", persist, "-c", config], { stdio: "ignore", env: { ...process.env, CI: "1" } });
  w = await unstable_dev(join(here, "entry.ts"), {
    config,
    persistTo: persist,
    vars: { TEST_JWK: JSON.stringify(jwk), SESSION_SIGNING_KEY: `test-${randomUUID()}` },
    logLevel: "none",
    experimental: { disableExperimentalWarning: true },
  });
}, 120_000);
afterAll(async () => { try { await w?.stop(); } finally { rmSync(persist, { recursive: true, force: true }); } });

describe("sessions (MASTER_PLAN §6.1)", () => {
  it("exchanges a valid Firebase ID token for a 15-minute session and creates the user", async () => {
    const s = await signIn();
    expect(s.user).toMatchObject({ id: "alice-uid", displayName: "Alice", email: "alice@example.test" });
    expect(s.expiresAt - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(s.expiresAt - Date.now()).toBeLessThanOrEqual(15 * 60_000);
    const me = await api("/me", { token: s.session });
    expect(me.status).toBe(200);
    expect((await me.json()) as unknown).toMatchObject({ id: "alice-uid" });
  });

  it("refuses bad tokens: wrong signature, unknown key, other project, expired", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    const now = Math.floor(Date.now() / 1000);
    for (const t of [
      idToken({}, { key: other }),
      idToken({}, { kid: "nope" }),
      idToken({ aud: "someone-else", iss: "https://securetoken.google.com/someone-else" }),
      idToken({ exp: now - 120 }),
      "not.a.jwt-but-long-enough",
    ]) {
      const r = await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: t }) });
      expect(r.status, t.slice(0, 20)).toBe(401);
      expect(await r.json()).toEqual({ error: "invalid_token" });
    }
  });

  it("email/password users need a verified email first", async () => {
    const r = await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: idToken({ sub: "bob-uid", email_verified: false, firebase: { sign_in_provider: "password" } }) }) });
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: "email_unverified" });
  });

  it("protected routes need a valid session; tampered tokens are refused", async () => {
    expect((await api("/me")).status).toBe(401);
    const s = await signIn();
    const tampered = s.session.slice(0, -2) + (s.session.endsWith("A") ? "BB" : "AA");
    expect((await api("/me", { token: tampered })).status).toBe(401);
  });

  it("refresh tokens are single use; replaying an old one revokes the session", async () => {
    const s = await signIn();
    const r1 = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) });
    expect(r1.status).toBe(200);
    const s2 = Session.parse(await r1.json());
    expect(s2.refreshToken).not.toBe(s.refreshToken);
    // replay of the used token → reuse detected → family revoked
    const replay = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "refresh_reused" });
    const after = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s2.refreshToken }) });
    expect(after.status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const s = await signIn();
    expect((await api("/auth/logout", { method: "POST", token: s.session })).status).toBe(204);
    expect((await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) })).status).toBe(401);
  });
});

describe("preferences (MASTER_PLAN §7.1)", () => {
  it("ETag / If-None-Match / If-Match with per-key newest-wins", async () => {
    const s = await signIn({ sub: "prefs-uid" });
    const g = await api("/me/preferences", { token: s.session });
    expect(g.headers.get("etag")).toBe('"p:0"');
    expect(Preferences.parse(await g.json())).toEqual({ version: 0, values: {} });
    expect((await api("/me/preferences", { token: s.session, headers: { "if-none-match": '"p:0"' } })).status).toBe(304);

    const set = { "rooms.newRoomGuidelines": { value: "own", updatedAt: Date.now() } };
    expect((await api("/me/preferences", { method: "PATCH", token: s.session, body: JSON.stringify({ set }) })).status).toBe(428);
    const p1 = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:0"' }, body: JSON.stringify({ set }) });
    expect(p1.status).toBe(200);
    expect(Preferences.parse(await p1.json()).version).toBe(1);

    // stale If-Match → 412 with the current copy so the client can merge
    const stale = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:0"' }, body: JSON.stringify({ set }) });
    expect(stale.status).toBe(412);
    expect(((await stale.json()) as { current: Preferences }).current.version).toBe(1);

    // an older write for the same key doesn't win
    const old = { "rooms.newRoomGuidelines": { value: "category", updatedAt: 1 } };
    const p2 = Preferences.parse(await (await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:1"' }, body: JSON.stringify({ set: old }) })).json());
    expect(p2.values["rooms.newRoomGuidelines"]!.value).toBe("own");

    const bad = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": `"p:${p2.version}"` }, body: JSON.stringify({ set: { "bad key!": { value: 1, updatedAt: 1 } } }) });
    expect(bad.status).toBe(400);
    const missingValue = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": `"p:${p2.version}"` }, body: JSON.stringify({ set: { x: { updatedAt: 1 } } }) });
    expect(missingValue.status).toBe(400);
  });
});

/** Read the local D1 directly (what the storage-router will see). */
function d1(sql: string): Array<Record<string, unknown>> {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "hangcord-test", "--local", "--persist-to", persist, "-c", config, "--json", "--command", sql], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  return (JSON.parse(out) as Array<{ results: Array<Record<string, unknown>> }>)[0]!.results;
}

describe("hangouts, snapshot and + room", () => {
  it("creates a hangout with a starter category, room and lounge; owner sees everything", async () => {
    const s = await signIn({ sub: "owner-uid", name: "Owner" });
    const c = await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "Night Owls" }) });
    expect(c.status).toBe(201);
    const h = (await c.json()) as { id: string };
    expect(h.id).toMatch(/^[a-z2-7]{16}$/);

    const list = (await (await api("/hangouts", { token: s.session })).json()) as Array<{ id: string }>;
    expect(list.map((x) => x.id)).toContain(h.id);

    const snapRes = await api(`/hangouts/${h.id}/snapshot`, { token: s.session });
    expect(snapRes.status).toBe(200);
    const etag = snapRes.headers.get("etag");
    expect(etag).toBe(`"h:${h.id}:1"`);
    const snap = HangoutSnapshot.parse(await snapRes.json());
    expect(snap.rooms.map((r) => [r.type, r.name])).toEqual([["category", "Hangout"], ["text", "general"], ["lounge", "Lounge"]]);
    for (const bits of Object.values(snap.myPermissions)) expect(BigInt(bits) & BIT.MANAGE_ROOMS).toBe(BIT.MANAGE_ROOMS);
    expect((await api(`/hangouts/${h.id}/snapshot`, { token: s.session, headers: { "if-none-match": etag! } })).status).toBe(304);
  });

  it("+ adds a room that follows the category, bumps the version, and is journaled", async () => {
    const s = await signIn({ sub: "owner2-uid" });
    const { id } = (await (await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "Study" }) })).json()) as { id: string };
    const snap = HangoutSnapshot.parse(await (await api(`/hangouts/${id}/snapshot`, { token: s.session })).json());
    const cat = snap.rooms.find((r) => r.type === "category")!;
    const res = await api(`/hangouts/${id}/rooms`, { method: "POST", token: s.session, body: JSON.stringify({ type: "text", name: "Exam Prep!", categoryId: cat.id, guidelines: "category" }) });
    expect(res.status).toBe(201);
    const room = Room.parse(await res.json());
    expect(room).toMatchObject({ name: "exam-prep", categoryId: cat.id, syncWithCategory: true });
    const after = await api(`/hangouts/${id}/snapshot`, { token: s.session });
    expect(after.headers.get("etag")).toBe(`"h:${id}:2"`);
    expect(HangoutSnapshot.parse(await after.json()).rooms.some((r) => r.id === room.id)).toBe(true);
    // write-ahead journal (MASTER_PLAN §8.5): every change of the hangout is there, in order
    const j = d1(`SELECT tbl, op FROM journal WHERE pk LIKE '%${id}%' OR cols LIKE '%${id}%' ORDER BY seq`);
    expect(j.map((r) => r.tbl)).toEqual(["hangouts", "roles", "members", "rooms", "rooms", "rooms", "rooms", "hangouts"]);
    expect(j.at(-1)).toEqual({ tbl: "hangouts", op: "update" });
  });

  it("strangers can't see or add to someone else's hangout (404, not 403)", async () => {
    const owner = await signIn({ sub: "owner3-uid" });
    const { id } = (await (await api("/hangouts", { method: "POST", token: owner.session, body: JSON.stringify({ name: "Private" }) })).json()) as { id: string };
    const eve = await signIn({ sub: "eve-uid" });
    expect((await api(`/hangouts/${id}/snapshot`, { token: eve.session })).status).toBe(404);
    expect((await api(`/hangouts/${id}`, { token: eve.session })).status).toBe(404);
    const add = await api(`/hangouts/${id}/rooms`, { method: "POST", token: eve.session, body: JSON.stringify({ type: "text", name: "x", categoryId: null, guidelines: "own" }) });
    expect(add.status).toBe(404);
  });

  it("validates input: bad JSON, unknown fields, wrong content type, oversize", async () => {
    const s = await signIn();
    expect((await api("/hangouts", { method: "POST", token: s.session, body: "{" })).status).toBe(400);
    expect((await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "ok name", owner: "me" }) })).status).toBe(400);
    expect((await w.fetch("http://api.test/v1/hangouts", { method: "POST", headers: { authorization: `Bearer ${s.session}`, "content-type": "text/plain" }, body: "x" } as never)).status).toBe(415);
    expect((await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "x".repeat(70_000) }) })).status).toBe(413);
  });
});


describe("security and concurrent writes", () => {
  it("logout invalidates already issued access tokens immediately", async () => {
    const s = await signIn({ sub: "logout-access" });
    expect((await api("/auth/logout", { method: "POST", token: s.session })).status).toBe(204);
    expect((await api("/me", { token: s.session })).status).toBe(401);
  });

  it("rotation cannot extend the fixed 30-day refresh family lifetime", async () => {
    const started = Date.now();
    const s = await signIn({ sub: "fixed-expiry" });
    const refresh = await api("/auth/refresh", { method: "POST", headers: { "x-test-now": String(started + 29 * 86_400_000) }, body: JSON.stringify({ refreshToken: s.refreshToken }) });
    expect(refresh.status).toBe(200);
    const next = Session.parse(await refresh.json());
    const expired = await api("/auth/refresh", { method: "POST", headers: { "x-test-now": String(started + 31 * 86_400_000) }, body: JSON.stringify({ refreshToken: next.refreshToken }) });
    expect(expired.status).toBe(401);
    expect((await api("/me", { token: s.session })).status).toBe(401);
  });

  it("persists valid preference keys that also name object prototype properties", async () => {
    const s = await signIn({ sub: "prefs-prototype" });
    const set = { toString: { value: "custom", updatedAt: 1 }, valueOf: { value: 7, updatedAt: 1 } };
    const res = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:0"' }, body: JSON.stringify({ set }) });
    expect(res.status).toBe(200);
    expect(Preferences.parse(await res.json()).values).toEqual(set);
    expect(Preferences.parse(await (await api("/me/preferences", { token: s.session })).json()).values).toEqual(set);
  });

  it("supports Firebase identifiers containing dots", async () => {
    const s = await signIn({ sub: "user.with.dots" });
    const r = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) });
    expect(r.status).toBe(200);
    expect(Session.parse(await r.json()).user.id).toBe("user.with.dots");
  });

  it("remembers replayed refresh tokens across multiple rotations", async () => {
    const first = await signIn({ sub: "old-replay" });
    let current = first;
    for (let i = 0; i < 3; i++) {
      const r = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: current.refreshToken }) });
      expect(r.status).toBe(200);
      current = Session.parse(await r.json());
    }
    const replay = await api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: first.refreshToken }) });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: "refresh_reused" });
    expect((await api("/me", { token: current.session })).status).toBe(401);
  });

  it("only one concurrent refresh succeeds; reuse revokes its family", async () => {
    const s = await signIn({ sub: "refresh-race" });
    const results = await Promise.all([1, 2].map(() => api("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken: s.refreshToken }) })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const winner = Session.parse(await results.find((r) => r.status === 200)!.json());
    expect((await api("/me", { token: winner.session })).status).toBe(401);
  });

  it("rejects unverified Google sign-ins and unsupported providers", async () => {
    for (const [claims, status] of [
      [{ email_verified: false }, 403],
      [{ firebase: { sign_in_provider: "anonymous" } }, 401],
    ] as const) {
      expect((await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: idToken(claims) }) })).status).toBe(status);
    }
  });

  it("concurrent first preference writes commit and journal exactly once", async () => {
    const s = await signIn({ sub: "prefs-race" });
    const results = await Promise.all(["own", "category"].map((value) => api("/me/preferences", {
      method: "PATCH", token: s.session, headers: { "if-match": '"p:0"' },
      body: JSON.stringify({ set: { "rooms.newRoomGuidelines": { value, updatedAt: Date.now() } } }),
    })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
    expect(d1("SELECT COUNT(*) AS n FROM journal WHERE tbl = 'user_prefs' AND pk LIKE '%prefs-race%'")[0]).toEqual({ n: 1 });
    const saved = Preferences.parse(await (await api("/me/preferences", { token: s.session })).json());
    expect(saved.version).toBe(1);
    const winner = Preferences.parse(await results.find((r) => r.status === 200)!.json());
    expect(saved).toEqual(winner);
    // Equal timestamps preserve the server value.
    const entry = saved.values["rooms.newRoomGuidelines"]!;
    const tied = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:1"' }, body: JSON.stringify({ set: { "rooms.newRoomGuidelines": { value: "ask", updatedAt: entry.updatedAt } } }) });
    expect(Preferences.parse(await tied.json()).values["rooms.newRoomGuidelines"]).toEqual(entry);
    const bad = await api("/me/preferences", { method: "PATCH", token: s.session, headers: { "if-match": '"p:2"' }, body: '{"set":{"constructor":{"value":1,"updatedAt":1}}}' });
    expect(bad.status).toBe(400);
  });

  it("measures body limits in UTF-8 bytes", async () => {
    const s = await signIn();
    const r = await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "界".repeat(23_000) }) });
    expect(r.status).toBe(413);
  });

  it("keeps the category capacity under concurrent room creation", async () => {
    const s = await signIn({ sub: "capacity-owner" });
    const { id } = await (await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "Capacity" }) })).json() as { id: string };
    const before = HangoutSnapshot.parse(await (await api(`/hangouts/${id}/snapshot`, { token: s.session })).json());
    const cat = before.rooms.find((r) => r.type === "category")!;
    const rows = Array.from({ length: 47 }, (_, i) => `('fixture-${i}', '${id}', 'text', '${cat.id}', ${i + 2}, 'fixture-${i}', '{}', 1, 1)`).join(",");
    d1(`INSERT INTO rooms (id, hangout_id, type, category_id, position, name, settings_json, sync_with_category, created_at) VALUES ${rows}`);
    const results = await Promise.all(["one", "two"].map((name) => api(`/hangouts/${id}/rooms`, { method: "POST", token: s.session, body: JSON.stringify({ type: "text", name, categoryId: cat.id, guidelines: "category" }) })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(d1(`SELECT COUNT(*) AS n FROM rooms WHERE category_id = '${cat.id}'`)[0]).toEqual({ n: 50 });
    expect(d1(`SELECT COUNT(*) AS n FROM journal WHERE tbl = 'rooms' AND cols LIKE '%${id}%'`)[0]).toEqual({ n: 4 });
  });

  it("rechecks timed gates and category defaults for ordinary members", async () => {
    const owner = await signIn({ sub: "gates-owner" });
    const member = await signIn({ sub: "gates-member" });
    const { id } = await (await api("/hangouts", { method: "POST", token: owner.session, body: JSON.stringify({ name: "Gates" }) })).json() as { id: string };
    d1(`INSERT INTO members (hangout_id, user_id, joined_at, timeout_until) VALUES ('${id}', 'gates-member', 1, ${Date.now() + 60_000})`);
    const first = await api(`/hangouts/${id}/snapshot`, { token: member.session });
    const etag = first.headers.get("etag")!;
    const snap = HangoutSnapshot.parse(await first.json());
    const text = snap.rooms.find((r) => r.type === "text")!;
    const cat = snap.rooms.find((r) => r.type === "category")!;
    expect(BigInt(snap.myPermissions[text.id]!) & BIT.SEND_MESSAGES).toBe(0n);
    d1(`UPDATE members SET timeout_until = 1 WHERE user_id = 'gates-member'`);
    const after = await api(`/hangouts/${id}/snapshot`, { token: member.session, headers: { "if-none-match": etag } });
    expect(after.status).toBe(200);
    expect(BigInt(HangoutSnapshot.parse(await after.json()).myPermissions[text.id]!) & BIT.SEND_MESSAGES).toBe(BIT.SEND_MESSAGES);
    d1(`UPDATE rooms SET settings_json = '{"roomDefaults":{"ageRestricted":true}}' WHERE id = '${cat.id}'`);
    const restricted = HangoutSnapshot.parse(await (await api(`/hangouts/${id}/snapshot`, { token: member.session })).json());
    expect(restricted.rooms.some((r) => r.id === text.id)).toBe(false);
    d1(`UPDATE members SET roles_json = '["unknown-role"]' WHERE user_id = 'gates-member'`);
    const invalid = HangoutSnapshot.parse(await (await api(`/hangouts/${id}/snapshot`, { token: member.session })).json());
    expect(invalid.rooms).toEqual([]);
  });
});
