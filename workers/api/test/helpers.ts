// Shared by the API and gateway integration tests: test Firebase key, ID tokens, local Workers.
import { execFileSync } from "node:child_process";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";

const here = dirname(fileURLToPath(import.meta.url));
export const API_CONFIG = join(here, "wrangler.test.toml");
export const PROJECT = "hangcord-test";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const privateKey = keys.privateKey;
export const jwk = { ...keys.publicKey.export({ format: "jwk" }), kid: "test-kid", alg: "RS256", use: "sig" };
/** One per test run; never a real secret. */
export const SESSION_KEY = `test-${randomUUID()}`;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

export function idToken(claims: Record<string, unknown> = {}, opts: { kid?: string; key?: typeof privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: "alice-uid", iat: now, auth_time: now, exp: now + 3600,
    email: "alice@example.test", email_verified: true, name: "Alice", firebase: { sign_in_provider: "google.com" }, ...claims,
  };
  const head = b64({ alg: "RS256", kid: opts.kid ?? "test-kid", typ: "JWT" });
  const body = b64(payload);
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(opts.key ?? privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

export const newPersistDir = () => mkdtempSync(join(tmpdir(), "hc-int-"));

export function migrate(persist: string) {
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "hangcord-test", "--local", "--persist-to", persist, "-c", API_CONFIG], { stdio: "ignore", env: { ...process.env, CI: "1" } });
}

/** Run SQL on the local D1 that both Workers share. */
export function d1(persist: string, sql: string): Array<Record<string, unknown>> {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "hangcord-test", "--local", "--persist-to", persist, "-c", API_CONFIG, "--json", "--command", sql], { encoding: "utf8", env: { ...process.env, CI: "1" } });
  return (JSON.parse(out) as Array<{ results: Array<Record<string, unknown>> }>)[0]!.results;
}

export function startApi(persist: string): Promise<Unstable_DevWorker> {
  return unstable_dev(join(here, "entry.ts"), {
    config: API_CONFIG, persistTo: persist, logLevel: "none",
    vars: { TEST_JWK: JSON.stringify(jwk), SESSION_SIGNING_KEY: SESSION_KEY },
    experimental: { disableExperimentalWarning: true },
  });
}

export function client(w: Unstable_DevWorker) {
  return (path: string, init: RequestInit & { token?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token) headers.set("authorization", `Bearer ${init.token}`);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    return w.fetch(`http://local.test/v1${path}`, { ...init, headers } as never) as unknown as Promise<Response>;
  };
}
