// TEST-ONLY entry (never deployed): the real app with a fixed public key in place of Google's JWKS.
// Production uses src/index.ts, which has no way to accept any other key.
import { withConfigGate } from "@hangcord/worker-kit";
import { makeApp, type Env } from "../src/app";
import { importRsaJwk } from "../src/auth/firebase";

export { UserDO } from "../src/user-do";

type TestEnv = Env & { TEST_JWK: string };

let app: ReturnType<typeof makeApp> | null = null;
export default {
  fetch: withConfigGate<TestEnv>("api", ["SESSION_SIGNING_KEY"], (req, env, url) => {
    app ??= makeApp({
      keys: async (kid) => {
        const jwk = JSON.parse(env.TEST_JWK) as JsonWebKey & { kid: string };
        return kid === jwk.kid ? importRsaJwk(jwk) : null;
      },
    });
    return app(req, env, url);
  }),
} satisfies ExportedHandler<TestEnv>;
