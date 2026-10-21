import { describe, expect, it } from "vitest";
import worker from "../src/index";

// The "no public route" check on wrangler.toml lives in tools/policy (repo-wide config rules).
describe("emergency-restore", () => {
  it("answers 404 to everything in phase 0", async () => {
    expect((await worker.fetch()).status).toBe(404);
  });
});
