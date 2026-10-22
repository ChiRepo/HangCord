// Integration tests: the real Worker (test entry) on local workerd with a real local D1 + Durable Objects.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type { Unstable_DevWorker } from "wrangler";
import { HangoutSnapshot, Preferences, Room, Session, BIT } from "@hangcord/protocol";
import { client, d1 as d1At, idToken, migrate, newPersistDir, startApi } from "./helpers";

const persist = newPersistDir();
let w: Unstable_DevWorker;
let api: ReturnType<typeof client>;
const signIn = async (claims: Record<string, unknown> = {}) => {
  const r = await api("/auth/session", { method: "POST", body: JSON.stringify({ idToken: idToken(claims) }) });
  expect(r.status).toBe(200);
  return Session.parse(await r.json());
};
const d1 = (sql: string) => d1At(persist, sql);

beforeAll(async () => {
  migrate(persist);
  w = await startApi(persist);
  api = client(w);
}, 120_000);
afterAll(async () => { await w?.stop(); });

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
  });
});

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
    expect(snap.rooms.map((r) => `${r.type}:${r.name}`).sort()).toEqual(["category:Hangout", "lounge:Lounge", "text:general"]);
    const cat = snap.rooms.find((r) => r.type === "category")!;
    expect(snap.rooms.filter((r) => r.type !== "category").every((r) => r.categoryId === cat.id && r.syncWithCategory)).toBe(true);
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
    expect((await w.fetch("http://local.test/v1/hangouts", { method: "POST", headers: { authorization: `Bearer ${s.session}`, "content-type": "text/plain" }, body: "x" } as never)).status).toBe(415);
    expect((await api("/hangouts", { method: "POST", token: s.session, body: JSON.stringify({ name: "x".repeat(70_000) }) })).status).toBe(413);
  });
});
