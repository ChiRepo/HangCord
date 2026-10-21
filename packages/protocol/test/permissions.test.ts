import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PERMISSIONS, KNOWN_BITS, ROOM_SCOPED_BITS, parseBits, BIT, has } from "../src";

const here = dirname(fileURLToPath(import.meta.url));

describe("permission bits", () => {
  it("match the table in ACCESS_AND_SETTINGS §3 exactly", () => {
    const md = readFileSync(resolve(here, "../../../docs/ACCESS_AND_SETTINGS.md"), "utf8");
    const section = md.slice(md.indexOf("## 3. Permission flags"), md.indexOf("## 4."));
    const rows = [...section.matchAll(/^\|\s*(\d+)\s*\|\s*`([A-Z_]+)`\s*\|\s*([HR/]+)\s*\|/gm)].map((m) => [Number(m[1]), m[2], m[3]]);
    expect(rows.length).toBeGreaterThan(50);
    expect(PERMISSIONS.map((p) => [...p])).toEqual(rows);
  });
  it("parses only valid u64 strings with assigned bits", () => {
    expect(parseBits("0")).toBe(0n);
    expect(parseBits(String(BIT.MANAGE_ROOMS))).toBe(BIT.MANAGE_ROOMS);
    expect(parseBits(String(1n << 60n))).toBeNull(); // unassigned
    expect(parseBits("18446744073709551615999")).toBeNull(); // > u64
    expect(parseBits("-1")).toBeNull();
    expect(parseBits("1e3")).toBeNull();
  });
  it("hangout-only bits are not room-scoped", () => {
    expect(ROOM_SCOPED_BITS & BIT.ADMINISTRATOR).toBe(0n);
    expect(ROOM_SCOPED_BITS & BIT.MANAGE_ROOMS).toBe(BIT.MANAGE_ROOMS);
    expect(KNOWN_BITS).toBe((1n << 60n) - 1n);
    expect(has(BIT.VIEW_ROOM | BIT.SPEAK, "SPEAK")).toBe(true);
  });
});
