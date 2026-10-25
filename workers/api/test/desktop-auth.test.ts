import { describe, expect, it } from "vitest";
import { makeApp, withNativeCors, type Env } from "../src/app";

const app = makeApp({ keys: async () => null });
const env = {} as Env;
const req = (path: string, method = "GET", body?: unknown) => new Request(`https://api.test/v1${path}`, {
  method,
  ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
});

describe("desktop auth configuration", () => {
  it("fails closed with the route-specific code when each route lacks configuration", async () => {
    for (const request of [
      req("/auth/desktop-config"),
      req("/auth/password", "POST", { email: "person@example.test", password: "password" }),
      req("/auth/google/exchange", "POST", { code: "code", codeVerifier: "A".repeat(43), redirectUri: "http://127.0.0.1:4321/oauth/callback" }),
    ]) {
      const response = await app(request, env, new URL(request.url));
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({ error: "auth_not_configured" });
    }
  });

  it("rejects disallowed origins before dispatch and lets native requests omit Origin", async () => {
    const wrapped = withNativeCors(async (_request) => new Response("ok", { status: 200 }));
    const blocked = await wrapped(new Request("https://api.test/v1/me", { headers: { origin: "https://evil.example" } }), env);
    expect(blocked.status).toBe(403);
    const native = await wrapped(new Request("https://api.test/v1/me"), env);
    expect(native.status).toBe(200);
    expect(native.headers.get("access-control-allow-origin")).toBeNull();
  });
});
