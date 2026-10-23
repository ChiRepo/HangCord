// Verify a Firebase ID token (RS256 JWT) without any Google SDK (MASTER_PLAN §6.1).
// Rules from Firebase's "verify ID tokens using a third-party JWT library" checklist.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
// Errors are short codes only; the token itself is never logged.
import { fromB64url } from "./session";

export interface FirebaseClaims {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  provider: "google.com" | "password"; // Only the sign-in methods permitted by MASTER_PLAN §6.1.
  name: string | null;
  picture: string | null;
}

export type KeySource = (kid: string) => Promise<CryptoKey | null>;
export type VerifyError = "bad_token" | "expired" | "wrong_project" | "unknown_key";

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const SKEW_S = 30;
const REFRESH_COOLDOWN_MS = 60_000; // Bounds unknown-kid traffic and retries during a provider outage.
const decodeJson = (s: string): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(fromB64url(s)));
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const importRsaJwk = (jwk: JsonWebKey) =>
  crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

/** Google's published keys, cached per isolate for the time the response's max-age allows. */
export function googleKeySource(fetcher: typeof fetch = fetch): KeySource {
  let cache: { keys: Map<string, CryptoKey>; until: number } | null = null;
  let inFlight: Promise<void> | null = null;
  let retryAt = 0;
  async function refresh(): Promise<void> {
    try {
      const res = await fetcher(GOOGLE_JWKS, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (!record(body) || !Array.isArray(body.keys) || body.keys.length === 0 || body.keys.length > 32) return;
      const keys = new Map<string, CryptoKey>();
      for (const k of body.keys) {
        if (!record(k) || typeof k.kid !== "string" || !k.kid || k.kid.length > 256 || k.kty !== "RSA" || (k.alg !== undefined && k.alg !== "RS256") || (k.use !== undefined && k.use !== "sig") || keys.has(k.kid)) return;
        keys.set(k.kid, await importRsaJwk({ ...k, kty: "RSA" }));
      }
      const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
      cache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
    } catch { /* Provider failure is fail-closed; never log response bodies or tokens. */ }
  }
  return async (kid) => {
    if (!kid || kid.length > 256) return null;
    if (cache && Date.now() < cache.until && cache.keys.has(kid)) return cache.keys.get(kid)!;
    if (!inFlight && Date.now() >= retryAt) {
      retryAt = Date.now() + REFRESH_COOLDOWN_MS;
      inFlight = refresh().finally(() => { inFlight = null; });
    }
    if (inFlight) await inFlight;
    return cache && Date.now() < cache.until ? cache.keys.get(kid) ?? null : null;
  };
}

export async function verifyFirebaseIdToken(
  token: string,
  opts: { projectId: string; keys: KeySource; nowS?: number },
): Promise<{ ok: true; claims: FirebaseClaims } | { ok: false; error: VerifyError }> {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 16_384 || !opts.projectId) return { ok: false, error: "bad_token" };
  try {
    const header = decodeJson(parts[0]!);
    const p = decodeJson(parts[1]!);
    if (!record(header) || !record(p) || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256 || header.crit !== undefined || (header.typ !== undefined && header.typ !== "JWT")) return { ok: false, error: "bad_token" };
    const signature = fromB64url(parts[2]!);
    const key = await opts.keys(header.kid);
    if (!key) return { ok: false, error: "unknown_key" };
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return { ok: false, error: "bad_token" };

    const now = opts.nowS ?? Math.floor(Date.now() / 1000);
    const numericDate = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    if (p.aud !== opts.projectId || p.iss !== `https://securetoken.google.com/${opts.projectId}`) return { ok: false, error: "wrong_project" };
    if (!Number.isSafeInteger(now) || !numericDate(p.exp) || !numericDate(p.iat) || !numericDate(p.auth_time)) return { ok: false, error: "bad_token" };
    if (p.exp <= now) return { ok: false, error: "expired" };
    if (p.iat > now + SKEW_S || p.auth_time > now + SKEW_S || p.iat >= p.exp || p.auth_time > p.iat + SKEW_S || (p.nbf !== undefined && (!numericDate(p.nbf) || p.nbf > now + SKEW_S))) return { ok: false, error: "bad_token" };
    if (typeof p.sub !== "string" || !p.sub || p.sub.length > 128 || !record(p.firebase)) return { ok: false, error: "bad_token" };
    const provider = p.firebase.sign_in_provider;
    if (provider !== "google.com" && provider !== "password") return { ok: false, error: "bad_token" };
    if (typeof p.email !== "string" || !p.email || p.email.length > 320 || typeof p.email_verified !== "boolean") return { ok: false, error: "bad_token" };
    return { ok: true, claims: {
      uid: p.sub, email: p.email, emailVerified: p.email_verified, provider,
      name: typeof p.name === "string" ? p.name : null,
      picture: typeof p.picture === "string" ? p.picture : null,
    } };
  } catch { return { ok: false, error: "bad_token" }; }
}
