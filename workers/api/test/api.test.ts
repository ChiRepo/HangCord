import { describe, expect, it, vi } from "vitest";
import { withConfigGate } from "@hangcord/worker-kit";
import { REQUIRED_SECRETS, makeApp, type Env } from "../src/app";
import { parseRefreshToken, signSession, verifySession } from "../src/auth/session";

const gate = withConfigGate<Env>("api", REQUIRED_SECRETS, makeApp({ keys: async () => null }));
const env = (extra: Partial<Env> = {}) => ({ DB: {} as D1Database, USERS: {} as Env["USERS"], ...extra }) as Env;

describe("api worker (unit)", () => {
  it("fails closed without SESSION_SIGNING_KEY and never names it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await gate(new Request("https://api/v1/health"), env());
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("SESSION");
    expect((await gate(new Request("https://api/v1/health"), env({ SESSION_SIGNING_KEY: "k" }))).status).toBe(200);
    spy.mockRestore();
  });

  it("session tokens: round trip, expiry, wrong key, tampering", async () => {
    const t = await signSession("key-a", { uid: "u", sid: "s", exp: 2_000 });
    expect(await verifySession("key-a", t, 1_000)).toEqual({ uid: "u", sid: "s", exp: 2_000 });
    expect(await verifySession("key-a", t, 2_000)).toBeNull();
    expect(await verifySession("key-b", t, 1_000)).toBeNull();
    const [v, p, m] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "admin", s: "s", e: 9e15 })).toString("base64url");
    expect(await verifySession("key-a", `${v}.${forged}.${m}`, 1_000)).toBeNull();
    expect(await verifySession("key-a", `${v}.${p}`, 1_000)).toBeNull();
  });

  it("refresh token format", () => {
    expect(parseRefreshToken("uid.sid.secret")).toEqual({ uid: "uid", sid: "sid", secret: "secret" });
    expect(parseRefreshToken("a.b")).toBeNull();
    expect(parseRefreshToken("a..c")).toBeNull();
  });

  it("unknown paths 404, wrong method 405", async () => {
    const e = env({ SESSION_SIGNING_KEY: "k" });
    expect((await gate(new Request("https://api/v1/nope"), e)).status).toBe(404);
    expect((await gate(new Request("https://api/v1/me", { method: "DELETE" }), e)).status).toBe(405);
  });
});
