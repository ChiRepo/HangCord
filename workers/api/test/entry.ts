// TEST-ONLY entry (never deployed): the real app with a fixed public key in place of Google's JWKS.
// Production uses src/index.ts, which has no way to accept any other key.
import { withConfigGate } from "@hangcord/worker-kit";
import { makeApp, REQUIRED_SECRETS, withNativeCors, type Env } from "../src/app";
import { importRsaJwk } from "../src/auth/firebase";

export { UserDO } from "../src/user-do";

type TestEnv = Env & { TEST_JWK: string };


export default {
  fetch: withNativeCors(withConfigGate<TestEnv>("api", REQUIRED_SECRETS, (req, env, url) => {
    const app = makeApp({
      now: () => Number(req.headers.get("x-test-now") ?? Date.now()),
      keys: async (kid) => {
        const jwk = JSON.parse(env.TEST_JWK) as JsonWebKey & { kid: string };
        return kid === jwk.kid ? importRsaJwk(jwk) : null;
      },
      providerFetch: async (input, init) => {
        const mode = req.headers.get("x-test-provider-mode");
        if (mode === "fetch-error") throw new Error("test provider failure");
        if (mode === "redirect") return new Response(null, { status: 302, headers: { location: "https://example.invalid" } });
        if (mode === "oversized") return new Response("x".repeat(65_537), { status: 200 });
        if (mode === "malformed") return new Response("{", { status: 200, headers: { "content-type": "application/json" } });
        const url = String(input);
        if (url === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [JSON.parse(env.TEST_JWK)] }, { headers: { "cache-control": "public, max-age=3600" } });
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          if (mode === "provider-500") return Response.json({ error: "unavailable" }, { status: 500 });
          return Response.json({ id_token: req.headers.get("x-test-google-id-token") });
        }
        if (url.includes("accounts:signInWithPassword")) {
          if (mode === "provider-500") return Response.json({ error: { message: "INTERNAL_ERROR" } }, { status: 500 });
          if (mode === "rate-limit") return Response.json({ error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }, { status: 400 });
          if (mode === "password-failure") return Response.json({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }, { status: 400 });
          return Response.json({ idToken: req.headers.get("x-test-firebase-token") });
        }
        if (url.includes("accounts:signInWithIdp")) {
          const request = JSON.parse(String(init?.body)) as { idToken?: string };
          if ((mode === "collision" || mode === "collision-error") && !request.idToken) {
            if (mode === "collision-error") return Response.json({ errorMessage: "EMAIL_EXISTS", verifiedProvider: ["password"], email: req.headers.get("x-test-google-email"), rawUserInfo: "{}" });
            return Response.json({ needConfirmation: true, verifiedProvider: ["password"], email: req.headers.get("x-test-google-email"), rawUserInfo: "{}" });
          }
          if (mode === "collision-http-error" && !request.idToken) {
            return Response.json({ error: { message: "EMAIL_EXISTS" } }, { status: 400 });
          }
          return Response.json({
            idToken: req.headers.get(request.idToken ? "x-test-linked-token" : "x-test-firebase-token"),
            localId: req.headers.get("x-test-provider-uid") ?? "google-uid",
            email: req.headers.get("x-test-google-email") ?? "alice@example.test",
            emailVerified: true,
          });
        }
        return Response.json({ error: { message: "NOT_FOUND" } }, { status: 404 });
      },
    });
    return app(req, env, url);
  })),
} satisfies ExportedHandler<TestEnv>;
