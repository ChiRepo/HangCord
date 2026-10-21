import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { GatewayOp, parseFrame, CreateRoomRequest, Preferences } from "../src";

const here = dirname(fileURLToPath(import.meta.url));

describe("gateway contract", () => {
  it("lists every op named in MASTER_PLAN §6 and ACCESS_AND_SETTINGS §14", () => {
    const plan = readFileSync(resolve(here, "../../../docs/MASTER_PLAN.md"), "utf8");
    const access = readFileSync(resolve(here, "../../../docs/ACCESS_AND_SETTINGS.md"), "utf8");
    const gwLine = plan.slice(plan.indexOf("**Gateway (WSS)** ops:")).split("\n")[0]!;
    const accLine = access.slice(access.indexOf("Gateway events:")).split("\n")[0]!;
    const named = new Set<string>();
    for (const line of [gwLine, accLine]) {
      for (const m of line.matchAll(/`([A-Z_]+)(?:\/([A-Z_/]+))?/g)) {
        const first = m[1]!;
        named.add(first);
        // `ROOM_CREATE/UPDATE/DELETE` → ROOM_CREATE, ROOM_UPDATE, ROOM_DELETE
        const prefix = first.slice(0, first.lastIndexOf("_") + 1);
        for (const tail of (m[2] ?? "").split("/").filter(Boolean)) named.add(tail.includes("_") ? tail : prefix + tail);
      }
    }
    const known = new Set<string>(GatewayOp.options);
    const missing = [...named].filter((op) => !known.has(op));
    expect(missing).toEqual([]);
  });

  it("accepts a valid IDENTIFY with cache versions and rejects a malformed one", () => {
    const good = { op: "IDENTIFY", d: { token: "t", client: { platform: "web-mobile", version: "0.0.1" }, cache: { prefsVersion: 3, hangouts: { h1: 7 } } } };
    expect(parseFrame(good).ok).toBe(true);
    const bad = { op: "IDENTIFY", d: { token: "t", client: { platform: "toaster", version: "1" }, cache: { prefsVersion: -1, hangouts: {} } } };
    expect(parseFrame(bad)).toEqual({ ok: false, error: "bad_identify" });
  });

  it("rejects unknown ops", () => {
    expect(parseFrame({ op: "DROP_TABLES", d: {} })).toEqual({ ok: false, error: "bad_envelope" });
  });

  it("passes non-detailed ops through the envelope", () => {
    expect(parseFrame({ op: "TYPING_START", d: { roomId: "r1" } }).ok).toBe(true);
  });

  it("CreateRoomRequest requires a guidelines choice", () => {
    expect(CreateRoomRequest.safeParse({ type: "lounge", name: "Lounge", categoryId: "c1" }).success).toBe(false);
    expect(CreateRoomRequest.safeParse({ type: "lounge", name: "Lounge", categoryId: "c1", guidelines: "own" }).success).toBe(true);
  });

  it("Preferences carry per-key timestamps", () => {
    expect(Preferences.safeParse({ version: 1, values: { theme: { value: "dark", updatedAt: 1 } } }).success).toBe(true);
    expect(Preferences.safeParse({ version: 1, values: { theme: "dark" } }).success).toBe(false);
  });
});
