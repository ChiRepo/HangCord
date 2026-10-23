// API Worker routes for cp-002 (openapi.yaml, phase 1): sessions, me, preferences, hangouts, snapshot, + room.
// Every handler: validate with the shared zod schema → auth → computePermissions() → write() (journaled).
import {
  CreateHangoutRequest, CreateRoomRequest, NEW_ROOM_ERROR_STATUS, PRESET_MEMBER, PrefEntry, Preferences, PreferencesPatch,
  RefreshRequest, SessionRequest, has, planNewRoom, type HangoutSummary, type Session, type User,
} from "@hangcord/protocol";
import { errorResponse as err, json } from "@hangcord/worker-kit";
import type { z } from "zod";
import { verifyFirebaseIdToken, type KeySource } from "./auth/firebase";
import { SESSION_TTL_MS, formatRefreshToken, parseRefreshToken, randomToken, signSession, verifySession, type SessionClaims } from "@hangcord/server";
import { bitsFor, buildSnapshot, loadHangout, newId } from "@hangcord/server";
import { insert, update, write, type Change } from "@hangcord/server";
import type { UserDO } from "./user-do";

export interface Env extends Record<string, unknown> {
  SESSION_SIGNING_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  DB: D1Database;
  GATEWAY?: Fetcher;
  USERS: DurableObjectNamespace<UserDO>;
}

/**
 * Secrets this Worker refuses to run without, by phase (docs/SECRETS_AND_SENSITIVE_DATA.md).
 * Firebase project configuration stays in Workers Secrets per the owner's handoff.
 */
export const REQUIRED_SECRETS = ["SESSION_SIGNING_KEY", "FIREBASE_PROJECT_ID"] as const;

export interface Deps { keys: KeySource; now?: () => number }

const MAX_BODY = 64 * 1024;
const MAX_PREF_KEYS = 200;
const PREF_KEY = /^[A-Za-z0-9_.:-]{1,128}$/;
const MAX_PREF_VALUE = 4096;

type Handler = (c: Ctx) => Promise<Response>;
interface Ctx { req: Request; env: Env; url: URL; params: string[]; now: number; deps: Deps; auth?: SessionClaims }

const routes: Array<[string, RegExp, boolean, Handler]> = [];
const route = (method: string, path: string, authed: boolean, h: Handler) =>
  routes.push([method, new RegExp(`^/v1${path.replace(/:\w+/g, "([A-Za-z0-9_-]{1,64})")}$`), authed, h]);

export function makeApp(deps: Deps) {
  return async (req: Request, env: Env, url: URL): Promise<Response | null> => {
    if (/^\/v1\/rooms\/[a-z0-9_-]{1,64}\/messages$/.test(url.pathname)) {
      return env.GATEWAY ? env.GATEWAY.fetch(req) : err(503, "messages_unavailable");
    }
    for (const [method, re, authed, h] of routes) {
      const m = re.exec(url.pathname);
      if (!m) continue;
      if (req.method !== method) continue;
      const c: Ctx = { req, env, url, params: m.slice(1), now: deps.now?.() ?? Date.now(), deps };
      if (authed) {
        const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
        const claims = token ? await verifySession(env.SESSION_SIGNING_KEY!, token, c.now) : null;
        if (!claims || !await env.USERS.get(env.USERS.idFromName(claims.uid)).isActive(claims.sid, c.now)) return err(401, "unauthorized");
        c.auth = claims;
      }
      return h(c);
    }
    return routes.some(([, re]) => re.test(url.pathname)) ? err(405, "method_not_allowed") : null;
  };
}

async function body<S extends z.ZodTypeAny>(c: Ctx, schema: S): Promise<z.infer<S> | Response> {
  if (c.req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return err(415, "json_required");
  const reader = c.req.body?.getReader();
  if (!reader) return err(400, "bad_json");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return err(413, "too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  let data: unknown;
  try { data = JSON.parse(text); } catch { return err(400, "bad_json"); }
  const parsed = schema.safeParse(data);
  return parsed.success ? parsed.data : err(400, "bad_request");
}

// ---------------------------------------------------------------- sessions (MASTER_PLAN §6.1)

interface UserRow { id: string; display_name: string; email: string | null; avatar_url: string | null; created_at: number; email_verified: number }
const toUser = (u: UserRow): User => ({ id: u.id, displayName: u.display_name, email: u.email, avatarUrl: u.avatar_url, createdAt: u.created_at });
const getUser = (db: D1Database, uid: string) => db.prepare("SELECT id, display_name, email, avatar_url, created_at, email_verified FROM users WHERE id = ?").bind(uid).first<UserRow>();

async function issueSession(c: Ctx, uid: string, sid: string, secret: string, user: User): Promise<Response> {
  const expiresAt = c.now + SESSION_TTL_MS;
  const session = await signSession(c.env.SESSION_SIGNING_KEY!, { uid, sid, exp: expiresAt });
  const out: Session = { session, expiresAt, refreshToken: formatRefreshToken(uid, sid, secret), user };
  return json(out);
}

route("POST", "/auth/session", false, async (c) => {
  const b = await body(c, SessionRequest);
  if (b instanceof Response) return b;
  const v = await verifyFirebaseIdToken(b.idToken, { projectId: c.env.FIREBASE_PROJECT_ID ?? "", keys: c.deps.keys, nowS: Math.floor(c.now / 1000) });
  if (!v.ok) return err(401, "invalid_token");
  const cl = v.claims;
  if (cl.provider !== "password" && cl.provider !== "google.com") return err(403, "provider_not_allowed");
  if (!cl.emailVerified) return err(403, "email_unverified");

  const existing = await getUser(c.env.DB, cl.uid);
  const displayName = (existing?.display_name ?? cl.name ?? cl.email?.split("@")[0] ?? "HangCord user").slice(0, 64);
  if (!existing) {
    await write(c.env.DB, [insert("users", ["id"], {
      id: cl.uid, display_name: displayName, email: cl.email, avatar_url: cl.picture, provider: cl.provider, email_verified: 1, adult_confirmed: 0, created_at: c.now, updated_at: c.now,
    }, { sql: "NOT EXISTS (SELECT 1 FROM users WHERE id = ?)", args: [cl.uid] })], c.now);
  } else if (existing.email !== cl.email || existing.email_verified !== 1) {
    await write(c.env.DB, [update("users", { id: cl.uid }, { email: cl.email, email_verified: 1, updated_at: c.now })], c.now);
  }
  const user = toUser((await getUser(c.env.DB, cl.uid))!);
  const sid = randomToken(12);
  const secret = randomToken(32);
  await c.env.USERS.get(c.env.USERS.idFromName(cl.uid)).issue(sid, secret, c.now);
  return issueSession(c, cl.uid, sid, secret, user);
});

route("POST", "/auth/refresh", false, async (c) => {
  const b = await body(c, RefreshRequest);
  if (b instanceof Response) return b;
  const rt = parseRefreshToken(b.refreshToken);
  if (!rt) return err(401, "invalid_refresh");
  const next = randomToken(32);
  const result = await c.env.USERS.get(c.env.USERS.idFromName(rt.uid)).rotate(rt.sid, rt.secret, next, c.now);
  if (result !== "ok") return err(401, result === "reused" ? "refresh_reused" : "invalid_refresh");
  const u = await getUser(c.env.DB, rt.uid);
  if (!u) {
    await c.env.USERS.get(c.env.USERS.idFromName(rt.uid)).revoke(rt.sid);
    return err(401, "invalid_refresh");
  }
  return issueSession(c, rt.uid, rt.sid, next, toUser(u));
});

route("POST", "/auth/logout", true, async (c) => {
  await c.env.USERS.get(c.env.USERS.idFromName(c.auth!.uid)).revoke(c.auth!.sid);
  return new Response(null, { status: 204 });
});

route("GET", "/me", true, async (c) => {
  const u = await getUser(c.env.DB, c.auth!.uid);
  return u ? json(toUser(u)) : err(404, "not_found");
});

// ---------------------------------------------------------------- preferences (MASTER_PLAN §7.1)

async function loadPrefs(db: D1Database, uid: string): Promise<Preferences> {
  const row = await db.prepare("SELECT version, prefs_json FROM user_prefs WHERE user_id = ?").bind(uid).first<{ version: number; prefs_json: string }>();
  return row ? { version: row.version, values: JSON.parse(row.prefs_json) as Record<string, PrefEntry> } : { version: 0, values: {} };
}
const prefsEtag = (v: number) => `"p:${v}"`;

route("GET", "/me/preferences", true, async (c) => {
  const p = await loadPrefs(c.env.DB, c.auth!.uid);
  const etag = prefsEtag(p.version);
  if (c.req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  return json(p, { headers: { etag } });
});

route("PATCH", "/me/preferences", true, async (c) => {
  const ifMatch = c.req.headers.get("if-match");
  if (!ifMatch) return err(428, "if_match_required");
  const b = await body(c, PreferencesPatch);
  if (b instanceof Response) return b;
  for (const [k, v] of Object.entries(b.set)) {
    if (["__proto__", "constructor", "prototype"].includes(k) || !PREF_KEY.test(k) || JSON.stringify(v.value ?? null).length > MAX_PREF_VALUE || v.updatedAt > c.now + 60_000) return err(400, "bad_preference");
  }
  const cur = await loadPrefs(c.env.DB, c.auth!.uid);
  if (ifMatch !== prefsEtag(cur.version)) return json({ error: "version_conflict", current: cur }, { status: 412, headers: { etag: prefsEtag(cur.version) } });
  const values = { ...cur.values };
  for (const [k, v] of Object.entries(b.set)) if (!Object.hasOwn(values, k) || v.updatedAt > values[k]!.updatedAt) values[k] = v;
  if (Object.keys(values).length > MAX_PREF_KEYS) return err(400, "too_many_preferences");
  const next: Preferences = { version: cur.version + 1, values };
  const row = { user_id: c.auth!.uid, version: next.version, prefs_json: JSON.stringify(values), updated_at: c.now };
  // Conditional write: only if nobody else bumped the version in between.
  const guard = cur.version === 0
    ? { sql: "NOT EXISTS (SELECT 1 FROM user_prefs WHERE user_id = ?)", args: [c.auth!.uid] }
    : { sql: "EXISTS (SELECT 1 FROM user_prefs WHERE user_id = ? AND version = ?)", args: [c.auth!.uid, cur.version] };
  const change = cur.version === 0
    ? insert("user_prefs", ["user_id"], row, guard)
    : update("user_prefs", { user_id: c.auth!.uid }, { version: next.version, prefs_json: row.prefs_json, updated_at: c.now }, guard);
  if (!await write(c.env.DB, [change], c.now)) {
    const saved = await loadPrefs(c.env.DB, c.auth!.uid);
    return json({ error: "version_conflict", current: saved }, { status: 412, headers: { etag: prefsEtag(saved.version) } });
  }
  return json(next, { headers: { etag: prefsEtag(next.version) } });
});

// ---------------------------------------------------------------- hangouts

route("GET", "/hangouts", true, async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT h.id, h.name, h.icon, h.owner_id, h.version FROM members m JOIN hangouts h ON h.id = m.hangout_id WHERE m.user_id = ? AND h.deleted_at IS NULL ORDER BY m.joined_at",
  ).bind(c.auth!.uid).all<{ id: string; name: string; icon: string | null; owner_id: string; version: number }>();
  return json(rows.results.map((h): HangoutSummary => ({ id: h.id, name: h.name, icon: h.icon, ownerId: h.owner_id, version: h.version })));
});

route("POST", "/hangouts", true, async (c) => {
  const b = await body(c, CreateHangoutRequest);
  if (b instanceof Response) return b;
  const uid = c.auth!.uid;
  const id = newId();
  const cat = newId(), text = newId(), lounge = newId();
  const room = (rid: string, type: string, name: string, position: number, categoryId: string | null) =>
    insert("rooms", ["id"], { id: rid, hangout_id: id, type, category_id: categoryId, position, name, topic: null, settings_json: "{}", sync_with_category: categoryId ? 1 : 0, created_at: c.now });
  await write(c.env.DB, [
    insert("hangouts", ["id"], { id, owner_id: uid, name: b.name, icon: null, settings_json: "{}", verification_level: 0, policy_flags: 0, version: 1, perm_version: 1, created_at: c.now, deleted_at: null }),
    insert("roles", ["id"], { id, hangout_id: id, name: "@everyone", color: null, position: 0, permissions: PRESET_MEMBER.toString() }),
    insert("members", ["hangout_id", "user_id"], { hangout_id: id, user_id: uid, nickname: null, roles_json: "[]", joined_at: c.now, timeout_until: null, flags: 0 }),
    room(cat, "category", "Hangout", 0, null),
    room(text, "text", "general", 0, cat),
    room(lounge, "lounge", "Lounge", 1, cat),
  ], c.now);
  const out: HangoutSummary = { id, name: b.name, icon: null, ownerId: uid, version: 1 };
  return json(out, { status: 201 });
});

route("GET", "/hangouts/:id", true, async (c) => {
  const s = await loadHangout(c.env.DB, c.params[0]!, c.auth!.uid);
  if (!s) return err(404, "not_found");
  const out: HangoutSummary = { id: s.hangout.id, name: s.hangout.name, icon: s.hangout.icon, ownerId: s.hangout.owner_id, version: s.hangout.version };
  return json(out);
});

route("GET", "/hangouts/:id/snapshot", true, async (c) => {
  const s = await loadHangout(c.env.DB, c.params[0]!, c.auth!.uid);
  if (!s) return err(404, "not_found"); // non-members can't tell a hangout exists
  // Only owners have time-independent permissions. Members are always recomputed: timeout,
  // verification age and schedules can change without a stored version bump.
  const etag = `"h:${s.hangout.id}:${s.hangout.version}"`;
  if (c.auth!.uid === s.hangout.owner_id && c.req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "cache-control": "private, no-cache" } });
  return json(buildSnapshot(s, c.now), { headers: { etag, "cache-control": "private, no-cache" } });
});

route("POST", "/hangouts/:id/rooms", true, async (c) => {
  const b = await body(c, CreateRoomRequest);
  if (b instanceof Response) return b;
  const s = await loadHangout(c.env.DB, c.params[0]!, c.auth!.uid);
  if (!s) return err(404, "not_found");
  const category = b.categoryId ? s.rooms.find((r) => r.id === b.categoryId) ?? null : null;
  if (b.categoryId && !category) return err(400, "not_a_category");
  const where = category ? bitsFor(s, category.id, c.now) : bitsFor(s, undefined, c.now);
  const plan = planNewRoom({
    req: b, hangoutId: s.hangout.id, newId: newId(),
    canManageRooms: has(where, "MANAGE_ROOMS"),
    canManageRoomPermissions: has(where, "MANAGE_ROOM_PERMISSIONS"),
    creatorBits: where,
    category,
    roomsInCategory: category ? s.rooms.filter((r) => r.categoryId === category.id).length : 0,
    roomsInHangout: s.rooms.filter((r) => r.type !== "category").length,
  });
  if (!plan.ok) return err(NEW_ROOM_ERROR_STATUS[plan.error], plan.error);
  const r = plan.room;
  const settings = { ...(r.settings ?? {}), ...(r.guidelinesText !== undefined ? { guidelinesText: r.guidelinesText } : {}) };
  // All mutations in this batch share a stable guard; the final statement advances it.
  const guard = { sql: "EXISTS (SELECT 1 FROM hangouts WHERE id = ? AND version = ? AND perm_version = ? AND deleted_at IS NULL)", args: [s.hangout.id, s.hangout.version, s.hangout.perm_version] };
  const changes: Change[] = [
    insert("rooms", ["id"], { id: r.id, hangout_id: r.hangoutId, type: r.type, category_id: r.categoryId ?? null, position: r.position, name: r.name, topic: null, settings_json: JSON.stringify(settings), sync_with_category: r.syncWithCategory ? 1 : 0, created_at: c.now }, guard),
    // Synced rooms read the category's overrides live; own-guideline rooms get their own copy.
    ...(r.syncWithCategory ? [] : r.overrides.map((o) => insert("overrides", ["room_id", "target_type", "target_id"], { room_id: r.id, target_type: o.targetType, target_id: o.targetId, allow: o.allow, deny: o.deny }, guard))),
    update("hangouts", { id: s.hangout.id }, { version: s.hangout.version + 1 }, guard),
  ];
  if (!await write(c.env.DB, changes, c.now)) return err(409, "version_conflict");
  return json(r, { status: 201 });
});

