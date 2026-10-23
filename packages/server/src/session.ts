// HangCord sessions (MASTER_PLAN §6.1): a 15-minute HMAC-signed bearer token + a single-use refresh
// token whose hash lives only in the user's UserDO (Cloudflare-only, SECRETS_AND_SENSITIVE_DATA.md).

export const SESSION_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

const enc = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) throw new Error("bad_encoding");
  const bytes = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  if (b64url(bytes) !== s) throw new Error("bad_encoding");
  return bytes;
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

export interface SessionClaims { uid: string; sid: string; exp: number }
const validUid = (uid: unknown): uid is string => typeof uid === "string" && uid.length > 0 && uid.length <= 128 && decoder.decode(enc.encode(uid)) === uid;
const validSid = (sid: unknown): sid is string => typeof sid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(sid);
const validClaims = (c: SessionClaims) => validUid(c.uid) && validSid(c.sid) && Number.isSafeInteger(c.exp) && c.exp > 0;

/** `hc1.<payload>.<mac>` — versioned so the format can change with a key rotation. */
export async function signSession(secret: string, c: SessionClaims): Promise<string> {
  if (!secret || !validClaims(c)) throw new Error("bad_session");
  const payload = b64url(enc.encode(JSON.stringify({ u: c.uid, s: c.sid, e: c.exp })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`hc1.${payload}`)));
  return `hc1.${payload}.${b64url(mac)}`;
}

export async function verifySession(secret: string, token: string, now = Date.now()): Promise<SessionClaims | null> {
  if (!secret || token.length > 4096 || !Number.isSafeInteger(now)) return null;
  const parts = token.split(".");
  const [v, payload, mac] = parts;
  if (parts.length !== 3 || v !== "hc1" || !payload || !mac) return null;
  try {
    const macBytes = fromB64url(mac);
    if (macBytes.length !== 32) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), macBytes, enc.encode(`hc1.${payload}`)); // constant time
    if (!ok) return null;
    const p: unknown = JSON.parse(decoder.decode(fromB64url(payload)));
    if (typeof p !== "object" || !p || Array.isArray(p)) return null;
    const { u, s, e } = p as Record<string, unknown>;
    if (!validUid(u) || !validSid(s) || typeof e !== "number" || !Number.isSafeInteger(e) || e <= now || e > now + SESSION_TTL_MS) return null;
    return { uid: u, sid: s, exp: e };
  } catch {
    return null;
  }
}

/** Refresh token = `<base64url UTF-8 uid>.<sid>.<secret>`; only sha256(secret) is stored. */
export function formatRefreshToken(uid: string, sid: string, secret: string): string {
  if (!validUid(uid) || !validSid(sid) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error("bad_refresh");
  return `${b64url(enc.encode(uid))}.${sid}.${secret}`;
}

export function parseRefreshToken(t: string): { uid: string; sid: string; secret: string } | null {
  if (t.length > 2048) return null;
  const parts = t.split(".");
  if (parts.length !== 3 || !validSid(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2]!)) return null;
  try {
    const uid = decoder.decode(fromB64url(parts[0]!));
    if (!validUid(uid) || fromB64url(parts[2]!).length !== 32) return null;
    return { uid, sid: parts[1]!, secret: parts[2]! };
  } catch { return null; }
}
