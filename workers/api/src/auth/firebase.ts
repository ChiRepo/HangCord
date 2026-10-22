// Verify a Firebase ID token (RS256 JWT) without any Google SDK (MASTER_PLAN §6.1).
// Rules from Firebase's "verify ID tokens using a third-party JWT library" checklist.
// Errors are short codes only; the token itself is never logged.

export interface FirebaseClaims {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  provider: string; // firebase.sign_in_provider, e.g. "google.com" | "password"
  name: string | null;
  picture: string | null;
}

export type KeySource = (kid: string) => Promise<CryptoKey | null>;
export type VerifyError = "bad_token" | "expired" | "wrong_project" | "unknown_key";

const GOOGLE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const SKEW_S = 30;

const b64urlToBytes = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const decodeJson = (s: string): unknown => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export const importRsaJwk = (jwk: JsonWebKey) =>
  crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);

/** Google's published keys, cached per isolate for the time the response's max-age allows. */
export function googleKeySource(fetcher: typeof fetch = fetch): KeySource {
  let cache: { keys: Map<string, CryptoKey>; until: number } | null = null;
  return async (kid) => {
    if (!cache || Date.now() > cache.until || !cache.keys.has(kid)) {
      const res = await fetcher(GOOGLE_JWKS);
      if (!res.ok) return null;
      const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
      const keys = new Map<string, CryptoKey>();
      for (const k of body.keys ?? []) if (k.kid && k.kty === "RSA") keys.set(k.kid, await importRsaJwk(k));
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
      cache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
    }
    return cache.keys.get(kid) ?? null;
  };
}

export async function verifyFirebaseIdToken(
  token: string,
  opts: { projectId: string; keys: KeySource; nowS?: number },
): Promise<{ ok: true; claims: FirebaseClaims } | { ok: false; error: VerifyError }> {
  const parts = token.split(".");
  if (parts.length !== 3 || !opts.projectId) return { ok: false, error: "bad_token" };
  let header: { alg?: string; kid?: string }, p: Record<string, unknown>;
  try {
    header = decodeJson(parts[0]!) as typeof header;
    p = decodeJson(parts[1]!) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "bad_token" };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return { ok: false, error: "bad_token" };
  const key = await opts.keys(header.kid);
  if (!key) return { ok: false, error: "unknown_key" };
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) return { ok: false, error: "bad_token" };

  const now = opts.nowS ?? Math.floor(Date.now() / 1000);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  if (p.aud !== opts.projectId || p.iss !== `https://securetoken.google.com/${opts.projectId}`) return { ok: false, error: "wrong_project" };
  if (!(num(p.exp) > now - SKEW_S)) return { ok: false, error: "expired" };
  if (!(num(p.iat) <= now + SKEW_S) || !(num(p.auth_time) <= now + SKEW_S)) return { ok: false, error: "bad_token" };
  if (typeof p.sub !== "string" || p.sub.length === 0 || p.sub.length > 128) return { ok: false, error: "bad_token" };
  const fb = (p.firebase ?? {}) as { sign_in_provider?: unknown };
  return {
    ok: true,
    claims: {
      uid: p.sub,
      email: typeof p.email === "string" ? p.email : null,
      emailVerified: p.email_verified === true,
      provider: typeof fb.sign_in_provider === "string" ? fb.sign_in_provider : "unknown",
      name: typeof p.name === "string" ? p.name : null,
      picture: typeof p.picture === "string" ? p.picture : null,
    },
  };
}
