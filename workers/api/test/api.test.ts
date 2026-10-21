import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

// The + add-room planning logic is shared and tested in packages/protocol (src/rooms.ts).
describe("api worker", () => {
  it("health works once the phase-0 secret is set, and fails closed without it", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await worker.fetch(new Request("https://api/v1/health"), {})).status).toBe(503);
    const ok = await worker.fetch(new Request("https://api/v1/health"), { SESSION_SIGNING_KEY: "test-only" });
    expect(ok.status).toBe(200);
    spy.mockRestore();
  });
});
