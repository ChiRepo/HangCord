import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { googleKeySource, verifyFirebaseIdToken } from "../src/auth/firebase";
import { b64url, formatRefreshToken, parseRefreshToken, randomToken, SESSION_TTL_MS, signSession, verifySession } from "../src/auth/session";

const enc = new TextEncoder();
const now = 1_800_000_000;
let pair: CryptoKeyPair;
let jwk: JsonWebKey;
const claims = { aud: "test", iss: "https://securetoken.google.com/test", sub: "uid.with.dot", exp: now + 3600, iat: now, auth_time: now, email: "user@example.test", email_verified: true, firebase: { sign_in_provider: "google.com" } };
async function jwt(payload: unknown = claims, header: unknown = { alg: "RS256", kid: "first" }): Promise<string> {
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(payload)))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}
const verify = (token: string) => verifyFirebaseIdToken(token, { projectId: "test", keys: async () => pair.publicKey, nowS: now });
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
});
afterEach(() => vi.useRealTimers());

describe("Firebase verification", () => {
  it("accepts Google and password with the expected claims", async () => {
    for (const provider of ["google.com", "password"]) {
      const result = await verify(await jwt({ ...claims, firebase: { sign_in_provider: provider } }));
      expect(result.ok && result.claims.uid).toBe("uid.with.dot");
    }
  });
  it.each([null, [], 0, "invalid"])("rejects non-object payload %j without throwing", async (payload) => {
    expect(await verify(await jwt(payload))).toEqual({ ok: false, error: "bad_token" });
  });
  it.each([null, [], { alg: "none", kid: "first" }, { alg: "RS256", kid: "" }, { alg: "RS256", kid: "first", crit: ["b64"] }])("rejects invalid header %j", async (header) => {
    expect(await verify(await jwt(claims, header))).toEqual({ ok: false, error: "bad_token" });
  });
  it("rejects expired, future, malformed, wrong-project and unsupported-provider claims", async () => {
    for (const patch of [{ exp: now }, { iat: now + 31 }, { auth_time: -1 }, { exp: "later" }, { aud: "other" }, { iss: "other" }, { sub: "" }, { firebase: null }, { firebase: { sign_in_provider: "anonymous" } }, { email_verified: "true" }]) {
      expect((await verify(await jwt({ ...claims, ...patch }))).ok).toBe(false);
    }
  });
  it("rejects invalid signature encoding and extra segments", async () => {
    const token = await jwt();
    expect((await verify(token + ".extra")).ok).toBe(false);
    expect((await verify(token.slice(0, token.lastIndexOf(".") + 1) + "%")).ok).toBe(false);
  });
  it("preserves unverified email for the API verification gate", async () => {
    const result = await verify(await jwt({ ...claims, email_verified: false }));
    expect(result.ok && result.claims.emailVerified).toBe(false);
    expect(result.ok).toBe(true);
  });
  it("coalesces key fetches and limits unknown-kid fetches", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: [{ ...jwk, kid: "first" }] }, { headers: { "cache-control": "public, max-age=3600" } }));
    const keys = googleKeySource(fetcher);
    const results = await Promise.all([keys("first"), keys("missing1"), keys("missing2")]);
    expect(results[0]).not.toBeNull();
    expect(results.slice(1)).toEqual([null, null]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await keys("missing3");
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    await keys("missing4");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed after key expiry and throttles failed refreshes", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ keys: [{ ...jwk, kid: "first" }] }, { headers: { "cache-control": "max-age=1" } })).mockRejectedValue(new Error("network"));
    const keys = googleKeySource(fetcher);
    expect(await keys("first")).not.toBeNull();
    vi.advanceTimersByTime(60_001);
    expect(await keys("first")).toBeNull();
    expect(await keys("missing")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("HangCord tokens", () => {
  it("supports dotted and Unicode Firebase user IDs without ambiguous separators", () => {
    const secret = randomToken();
    for (const uid of ["a.b", "用戶.123", "🌱".repeat(64)]) {
      expect(parseRefreshToken(formatRefreshToken(uid, "session-id", secret))).toEqual({ uid, sid: "session-id", secret });
    }
  });
  it("rejects malformed refresh encodings", () => {
    const secret = randomToken();
    for (const token of [`YQ=.sid.${secret}`, `YQ.sid.${secret}.extra`, `YQ..${secret}`, `YQ.sid.short`, `_w.sid.${secret}`, `YR.sid.${secret}`]) expect(parseRefreshToken(token)).toBeNull();
  });
  it("verifies a valid access token and rejects extra segments, tampering and expiry", async () => {
    const at = now * 1000;
    const token = await signSession("test-signing-key", { uid: "a.b", sid: "session", exp: at + SESSION_TTL_MS });
    expect(await verifySession("test-signing-key", token, at)).toEqual({ uid: "a.b", sid: "session", exp: at + SESSION_TTL_MS });
    expect(await verifySession("test-signing-key", token + ".extra", at)).toBeNull();
    expect(await verifySession("wrong-key", token, at)).toBeNull();
    expect(await verifySession("test-signing-key", token, at + SESSION_TTL_MS)).toBeNull();
  });
  it("rejects unsafe claims even with a valid signature", async () => {
    const at = now * 1000;
    for (const payload of [null, [], { u: "", s: "s", e: at + 1000 }, { u: "u", s: "", e: at + 1000 }, { u: "u", s: "s", e: 1e50 }, { u: "u", s: "s", e: at + SESSION_TTL_MS + 1 }]) {
      const input = `hc1.${b64url(enc.encode(JSON.stringify(payload)))}`;
      const key = await crypto.subtle.importKey("raw", enc.encode("test-signing-key"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, enc.encode(input));
      expect(await verifySession("test-signing-key", `${input}.${b64url(new Uint8Array(mac))}`, at)).toBeNull();
    }
  });
});
