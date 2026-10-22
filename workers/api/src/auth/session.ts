// HangCord sessions (MASTER_PLAN §6.1): a 15-minute HMAC-signed bearer token + a single-use refresh
// token whose hash lives only in the user's UserDO (Cloudflare-only, SECRETS_AND_SENSITIVE_DATA.md).

export const SESSION_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

const enc = new TextEncoder();
export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(s: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

export interface SessionClaims { uid: string; sid: string; exp: number }

/** `hc1.<payload>.<mac>` — versioned so the format can change with a key rotation. */
export async function signSession(secret: string, c: SessionClaims): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: c.uid, s: c.sid, e: c.exp })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`hc1.${payload}`)));
  return `hc1.${payload}.${b64url(mac)}`;
}

export async function verifySession(secret: string, token: string, now = Date.now()): Promise<SessionClaims | null> {
  const [v, payload, mac] = token.split(".");
  if (v !== "hc1" || !payload || !mac || token.length > 1024) return null;
  let macBytes: Uint8Array;
  try { macBytes = fromB64url(mac); } catch { return null; }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), macBytes, enc.encode(`hc1.${payload}`)); // constant time
  if (!ok) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { u?: unknown; s?: unknown; e?: unknown };
    if (typeof p.u !== "string" || typeof p.s !== "string" || typeof p.e !== "number" || p.e <= now) return null;
    return { uid: p.u, sid: p.s, exp: p.e };
  } catch {
    return null;
  }
}

/** Refresh token = `<uid>.<sid>.<secret>`; uid routes to the UserDO, only sha256(secret) is stored. */
export function parseRefreshToken(t: string): { uid: string; sid: string; secret: string } | null {
  const parts = t.split(".");
  if (parts.length !== 3 || parts.some((x) => x.length === 0 || x.length > 128)) return null;
  return { uid: parts[0]!, sid: parts[1]!, secret: parts[2]! };
}
