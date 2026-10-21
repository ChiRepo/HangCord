import { describe, expect, it, vi } from "vitest";
import { missingSecrets, withConfigGate } from "../src";

describe("worker-kit", () => {
  it("treats empty and whitespace secrets as missing", () => {
    expect(missingSecrets({ A: "x", B: "", C: "  " }, ["A", "B", "C", "D"])).toEqual(["B", "C", "D"]);
  });

  it("fails closed without naming the secret to the client", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = withConfigGate("api", ["SESSION_SIGNING_KEY"], () => null);
    const res = await fetch(new Request("https://x/v1/health"), {});
    expect(res.status).toBe(503);
    const body = await res.text();
    expect(body).toBe('{"error":"not_configured"}');
    expect(body).not.toContain("SESSION_SIGNING_KEY");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("serves health and 404 when configured", async () => {
    const fetch = withConfigGate("gateway", ["K"], () => null);
    const ok = await fetch(new Request("https://x/v1/health"), { K: "v" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, service: "gateway", phase: 0 });
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect((await fetch(new Request("https://x/nope"), { K: "v" })).status).toBe(404);
  });

  it("hides internal errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = withConfigGate("api", [], () => { throw new Error("secret detail"); });
    const res = await fetch(new Request("https://x/boom"), {});
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
    spy.mockRestore();
  });
});
