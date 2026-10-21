import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import { jobsDue } from "../src/jobs";

const at = (iso: string) => new Date(iso);

describe("storage-router", () => {
  it("fails closed without CSV keys", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await worker.fetch(new Request("https://r/v1/health"), {})).status).toBe(503);
    spy.mockRestore();
  });

  it("schedules every job from one 15-minute cron", () => {
    expect(jobsDue(at("2026-10-21T10:30:00Z"))).toEqual(["snapshot-flush", "health-probe"]);
    expect(jobsDue(at("2026-10-21T10:00:00Z"))).toEqual(["snapshot-flush", "health-probe", "rebalance", "mover-ageing"]);
    expect(jobsDue(at("2026-10-21T01:30:00Z"))).toContain("journal-truncate");
    expect(jobsDue(at("2026-10-21T01:00:00Z"))).toContain("daily-csv-export");
    expect(jobsDue(at("2026-10-21T02:00:00Z"))).toContain("vault-sweep");
  });

  it("truncates the journal only after the daily export", () => {
    const tick = (iso: string) => jobsDue(at(iso));
    const firstExport = ["00:00", "00:15", "00:30", "00:45", "01:00", "01:15", "01:30"].findIndex((t) => tick(`2026-10-21T${t}:00Z`).includes("daily-csv-export"));
    const firstTruncate = ["00:00", "00:15", "00:30", "00:45", "01:00", "01:15", "01:30"].findIndex((t) => tick(`2026-10-21T${t}:00Z`).includes("journal-truncate"));
    expect(firstExport).toBeGreaterThanOrEqual(0);
    expect(firstTruncate).toBeGreaterThan(firstExport);
  });

  it("runs each daily job exactly once per day", () => {
    const counts: Record<string, number> = {};
    for (let t = Date.parse("2026-10-21T00:00:00Z"); t < Date.parse("2026-10-22T00:00:00Z"); t += 15 * 60_000) {
      for (const j of jobsDue(new Date(t))) counts[j] = (counts[j] ?? 0) + 1;
    }
    expect(counts["journal-truncate"]).toBe(1);
    expect(counts["daily-csv-export"]).toBe(1);
    expect(counts["vault-sweep"]).toBe(1);
    expect(counts["rebalance"]).toBe(24);
    expect(counts["snapshot-flush"]).toBe(96);
  });
});
