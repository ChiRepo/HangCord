import type { PasswordSignInRequest, GoogleExchangeRequest } from "@hangcord/protocol";
import { fromB64url } from "@hangcord/server";
import { importRsaJwk } from "./firebase";

export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ProviderFailure = { ok: false; status: 401 | 429 | 503; code?: string };
type ProviderReply = { ok: true; value: Record<string, unknown>; headers: Headers } | ProviderFailure;

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const FIREBASE_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts";
// Official native OAuth authorization-code exchange and Firebase Auth REST contracts:
// https://developers.google.com/identity/protocols/oauth2/native-app
// https://developers.google.com/identity/openid-connect/openid-connect
// https://firebase.google.com/docs/reference/rest/auth
const MAX_PROVIDER_BODY = 64 * 1024;
const PROVIDER_TIMEOUT_MS = 5_000;
const RATE_ERRORS = new Set(["TOO_MANY_ATTEMPTS_TRY_LATER", "TOO_MANY_REQUESTS"]);
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const GOOGLE_KEY_REFRESH_MS = 60_000;

let googleJwksCache: { keys: Map<string, CryptoKey>; until: number } | null = null;
let googleJwksRetryAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBounded(response: Response): Promise<unknown | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BODY) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return null;
  }
}

function providerError(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const message = value.error.message;
  if (typeof message !== "string" || message.length > 256) return null;
  return /^[A-Z0-9_]+$/.test(message) ? message : null;
}

async function requestJson(url: string, init: RequestInit, fetcher: ProviderFetch = fetch): Promise<ProviderReply> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch {
    return { ok: false, status: 503 };
  }
  // Provider redirects can change the destination or leak credentials; never follow or accept them.
  if (response.status >= 300 && response.status < 400 || response.redirected) return { ok: false, status: 503 };
  const value = await readBounded(response);
  if (!isRecord(value)) return { ok: false, status: 503 };
  if (!response.ok) {
    const error = providerError(value);
    if (response.status === 429 || (error && RATE_ERRORS.has(error))) return { ok: false, status: 429 };
    if (response.status >= 500) return { ok: false, status: 503 };
    return { ok: false, status: 401, ...(error ? { code: error } : {}) };
  }
  return { ok: true, value, headers: response.headers };
}

function validToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 20 && value.length <= 16_384;
}

function firebaseUrl(apiKey: string, operation: "signInWithPassword" | "signInWithIdp"): string {
  return `${FIREBASE_AUTH_URL}:${operation}?key=${encodeURIComponent(apiKey)}`;
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(fromB64url(segment)));
}

async function loadGoogleKeys(fetcher: ProviderFetch): Promise<boolean> {
  const response = await requestJson(GOOGLE_JWKS_URL, { method: "GET" }, fetcher);
  if (!response.ok || !Array.isArray(response.value.keys) || response.value.keys.length === 0 || response.value.keys.length > 32) return false;
  const keys = new Map<string, CryptoKey>();
  try {
    for (const candidate of response.value.keys) {
      if (!isRecord(candidate) || typeof candidate.kid !== "string" || !candidate.kid || candidate.kid.length > 256 || candidate.kty !== "RSA" || (candidate.alg !== undefined && candidate.alg !== "RS256") || (candidate.use !== undefined && candidate.use !== "sig") || keys.has(candidate.kid)) return false;
      keys.set(candidate.kid, await importRsaJwk({ ...candidate, kty: "RSA" }));
    }
  } catch {
    return false;
  }
  const maxAge = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  googleJwksCache = { keys, until: Date.now() + Math.min(maxAge, 6 * 3600) * 1000 };
  return true;
}

export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
  fetcher: ProviderFetch = fetch,
  nowS = Math.floor(Date.now() / 1000),
): Promise<{ ok: true; email: string } | ProviderFailure | { ok: false; status: 401 }> {
  if (!validToken(token) || !clientId) return { ok: false, status: 401 };
  let header: unknown;
  let claims: unknown;
  const parts = token.split(".");
  try {
    if (parts.length !== 3) return { ok: false, status: 401 };
    header = decodeJson(parts[0]!);
    claims = decodeJson(parts[1]!);
  } catch {
    return { ok: false, status: 401 };
  }
  if (!isRecord(header) || !isRecord(claims) || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || header.kid.length > 256 || header.crit !== undefined || (header.typ !== undefined && header.typ !== "JWT")) return { ok: false, status: 401 };

  let key = googleJwksCache && Date.now() < googleJwksCache.until ? googleJwksCache.keys.get(header.kid) ?? null : null;
  if (!key && Date.now() >= googleJwksRetryAt) {
    googleJwksRetryAt = Date.now() + GOOGLE_KEY_REFRESH_MS;
    if (!await loadGoogleKeys(fetcher)) return { ok: false, status: 503 };
    key = googleJwksCache?.keys.get(header.kid) ?? null;
  }
  if (!key) return { ok: false, status: 401 };
  try {
    const signature = fromB64url(parts[2]!);
    if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) return { ok: false, status: 401 };
  } catch {
    return { ok: false, status: 401 };
  }
  const date = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!GOOGLE_ISSUERS.has(String(claims.iss)) || claims.aud !== clientId || (claims.azp !== undefined && claims.azp !== clientId) || !date(claims.exp) || claims.exp <= nowS || !date(claims.iat) || claims.iat > nowS + 30 || claims.exp <= claims.iat || !date(nowS)) return { ok: false, status: 401 };
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 256 || typeof claims.email !== "string" || !claims.email || claims.email.length > 320 || claims.email_verified !== true) return { ok: false, status: 401 };
  return { ok: true, email: claims.email };
}

export async function firebasePasswordSignIn(
  credentials: PasswordSignInRequest,
  apiKey: string,
  fetcher?: ProviderFetch,
): Promise<{ ok: true; idToken: string } | ProviderFailure> {
  const result = await requestJson(firebaseUrl(apiKey, "signInWithPassword"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...credentials, returnSecureToken: true }),
  }, fetcher);
  if (!result.ok) return result;
  return validToken(result.value.idToken) ? { ok: true, idToken: result.value.idToken } : { ok: false, status: 503 };
}

export async function exchangeGoogleCode(
  body: Pick<GoogleExchangeRequest, "code" | "codeVerifier" | "redirectUri">,
  client: { clientId: string; clientSecret: string },
  fetcher?: ProviderFetch,
): Promise<{ ok: true; idToken: string } | ProviderFailure> {
  const params = new URLSearchParams({
    code: body.code,
    code_verifier: body.codeVerifier,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: body.redirectUri,
    grant_type: "authorization_code",
  });
  const result = await requestJson(GOOGLE_TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params.toString(),
  }, fetcher);
  if (!result.ok) return result;
  return validToken(result.value.id_token) ? { ok: true, idToken: result.value.id_token } : { ok: false, status: 503 };
}

export async function firebaseGoogleSignIn(
  googleIdToken: string,
  requestUri: string,
  apiKey: string,
  fetcher?: ProviderFetch,
  existingFirebaseIdToken?: string,
): Promise<{ ok: true; idToken: string; localId?: string; needConfirmation: boolean } | ProviderFailure | { ok: false; status: 409 }> {
  const postBody = new URLSearchParams({ id_token: googleIdToken, providerId: "google.com" }).toString();
  const result = await requestJson(firebaseUrl(apiKey, "signInWithIdp"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(existingFirebaseIdToken ? { idToken: existingFirebaseIdToken } : {}),
      postBody, requestUri, returnIdpCredential: true, returnSecureToken: true,
    }),
  }, fetcher);
  if (!result.ok) {
    // The signed Google ID token supplies the verified email for explicit password-proved linking.
    if (result.status === 401 && ["EMAIL_EXISTS", "FEDERATED_USER_ID_ALREADY_LINKED"].includes(result.code ?? "")) return { ok: false, status: 409 };
    return result;
  }
  if (["EMAIL_EXISTS", "FEDERATED_USER_ID_ALREADY_LINKED"].includes(String(result.value.errorMessage ?? ""))) return { ok: false, status: 409 };
  if (result.value.needConfirmation === true) {
    return { ok: true, idToken: "", needConfirmation: true };
  }
  if (!validToken(result.value.idToken)) return { ok: false, status: 503 };
  return {
    ok: true,
    idToken: result.value.idToken,
    localId: typeof result.value.localId === "string" ? result.value.localId : undefined,
    needConfirmation: false,
  };
}
