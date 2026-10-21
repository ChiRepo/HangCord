import { describe, expect, it } from "vitest";
import type { HangoutSnapshot, Preferences } from "@hangcord/protocol";
import {
  ClientCache, MemoryCacheStore, applyHangoutUpdate, applyPatch, PatchError, mergePreferences, pendingKeys,
  newRoomGuidelinesDefault, setPref, getPref, PREF_KEYS, planReadyForHangout, reconcileReady, etagForHangout,
} from "../src";

const snap = (version: number, extra: Partial<HangoutSnapshot> = {}): HangoutSnapshot => ({
  hangoutId: "h1",
  version,
  permVersion: 1,
  hangout: { id: "h1", name: "Night Owls" },
  rooms: [
    { id: "cat", hangoutId: "h1", type: "category", position: 0, name: "Study", syncWithCategory: false, overrides: [] },
    { id: "r1", hangoutId: "h1", type: "text", categoryId: "cat", position: 0, name: "general", syncWithCategory: true, overrides: [] },
  ],
  roles: [],
  me: { userId: "u1", roles: [] },
  myPermissions: { r1: "3072" },
  ...extra,
});

describe("applyPatch", () => {
  it("sets and removes without mutating the input", () => {
    const doc = { a: { b: 1 }, list: [1, 2, 3] };
    const out = applyPatch(doc, [
      { op: "set", path: ["a", "b"], value: 2 },
      { op: "remove", path: ["list", 0] },
      { op: "set", path: ["list", 2], value: 9 },
    ]);
    expect(out).toEqual({ a: { b: 2 }, list: [2, 3, 9] });
    expect(doc).toEqual({ a: { b: 1 }, list: [1, 2, 3] });
  });
  it("refuses prototype pollution and missing parents", () => {
    for (const bad of ["__proto__", "prototype", "constructor"]) {
      try {
        applyPatch({ a: {} }, [{ op: "set", path: ["a", bad, "x"], value: 1 }]);
        expect.unreachable(`${bad} accepted`);
      } catch (e) {
        expect(e).toBeInstanceOf(PatchError);
        expect((e as PatchError).code).toBe("unsafe_path");
      }
    }
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(() => applyPatch({}, [{ op: "set", path: ["missing", "x"], value: 1 }])).toThrow(PatchError);
  });
});

describe("hangout updates", () => {
  it("applies the next version, ignores old ones, refetches on a gap", () => {
    const s = snap(5);
    const r = applyHangoutUpdate(s, { version: 6, patch: [{ op: "set", path: ["hangout", "name"], value: "Owls" }] });
    expect(r.status).toBe("applied");
    if (r.status === "applied") expect(r.snapshot.hangout.name).toBe("Owls");
    expect(applyHangoutUpdate(s, { version: 5, patch: [] }).status).toBe("stale-event");
    expect(applyHangoutUpdate(s, { version: 8, patch: [] }).status).toBe("refetch");
  });
  it("a permission change forces a refetch instead of keeping stale bits", () => {
    expect(applyHangoutUpdate(snap(5), { version: 6, permVersion: 2, patch: [] })).toEqual({ status: "refetch" });
    expect(applyHangoutUpdate(snap(5), { version: 6, permVersion: 1, patch: [] }).status).toBe("applied");
  });
  it("a patch that breaks the snapshot or moves it to another hangout means refetch", () => {
    expect(applyHangoutUpdate(snap(5), { version: 6, patch: [{ op: "remove", path: ["rooms"] }] })).toEqual({ status: "refetch" });
    expect(applyHangoutUpdate(snap(5), { version: 6, patch: [{ op: "set", path: ["hangoutId"], value: "evil" }] })).toEqual({ status: "refetch" });
  });
  it("a bad patch means refetch, never a corrupt cache", () => {
    expect(applyHangoutUpdate(snap(5), { version: 6, patch: [{ op: "remove", path: ["rooms", 99] }] }).status).toBe("refetch");
  });
});

describe("READY planning (server) and reconciling (client)", () => {
  const log = new Map([[6, [{ op: "set" as const, path: ["hangout", "name"], value: "A" }]], [7, [{ op: "set" as const, path: ["hangout", "name"], value: "B" }]]]);
  it("sends patches for small gaps and a full snapshot otherwise", () => {
    const current = snap(7, { hangout: { id: "h1", name: "B" } });
    expect(planReadyForHangout({ clientVersion: 7, current, patchLog: log })).toEqual({ kind: "unchanged", version: 7 });
    const p = planReadyForHangout({ clientVersion: 5, current, patchLog: log });
    expect(p.kind).toBe("patches");
    expect(planReadyForHangout({ clientVersion: 5, current, patchLog: log, maxPatches: 1 }).kind).toBe("full");
    expect(planReadyForHangout({ clientVersion: undefined, current, patchLog: log }).kind).toBe("full");
    expect(planReadyForHangout({ clientVersion: 2, current, patchLog: log }).kind).toBe("full"); // log missing v3..5
    expect(planReadyForHangout({ clientVersion: 5, current: null, patchLog: log })).toEqual({ kind: "removed" });
    expect(p.kind === "patches" && p.toPermVersion).toBe(1);
    expect(reconcileReady(snap(5), { ...(p as Extract<typeof p, { kind: "patches" }>), toPermVersion: 9 })).toEqual({ kind: "refetch" });
    const action = reconcileReady(snap(5), p);
    expect(action.kind === "replace" && action.snapshot.hangout.name).toBe("B");
  });
  it("wipes removed hangouts and refetches on mismatch", () => {
    expect(reconcileReady(snap(5), { kind: "removed" })).toEqual({ kind: "wipe" });
    expect(reconcileReady(snap(5), { kind: "unchanged", version: 6 })).toEqual({ kind: "refetch" });
    expect(reconcileReady(undefined, { kind: "patches", fromVersion: 5, toVersion: 6, patches: [[]] })).toEqual({ kind: "refetch" });
  });
  it("ETags encode id and version", () => expect(etagForHangout(snap(9))).toBe('"h:h1:9"'));
});

describe("preferences", () => {
  const server: Preferences = { version: 4, values: { theme: { value: "dark", updatedAt: 10 }, lang: { value: "en", updatedAt: 50 } } };
  const local: Preferences = { version: 3, values: { theme: { value: "light", updatedAt: 20 }, lang: { value: "hi", updatedAt: 40 } } };
  it("merges per key, newest wins", () => {
    const m = mergePreferences(local, server);
    expect(m.values.theme!.value).toBe("light");
    expect(m.values.lang!.value).toBe("en");
    expect(m.version).toBe(4);
    expect(pendingKeys(local, server)).toEqual(["theme"]);
  });
  it("new-room guidelines default: per-hangout beats global, 'ask' means none, junk means category", () => {
    let p: Preferences = { version: 0, values: {} };
    expect(newRoomGuidelinesDefault(p, "h1")).toBe("category");
    p = setPref(p, PREF_KEYS.newRoomGuidelines, "own", 1);
    expect(newRoomGuidelinesDefault(p, "h1")).toBe("own");
    p = setPref(p, PREF_KEYS.newRoomGuidelinesFor("h1"), "ask", 2);
    expect(newRoomGuidelinesDefault(p, "h1")).toBeNull();
    expect(newRoomGuidelinesDefault(p, "h2")).toBe("own");
    p = setPref(p, PREF_KEYS.newRoomGuidelines, "everyone-admin", 3);
    expect(newRoomGuidelinesDefault(p, "h2")).toBe("category");
  });
});

describe("store rules match the desktop store", () => {
  it("rejects bad keys and oversized values, like the Rust store", async () => {
    const s = new MemoryCacheStore();
    await expect(s.put("Hangout:X", {})).rejects.toThrow("bad_key");
    await expect(s.put("prefs", "x".repeat(2 * 1024 * 1024 + 10))).rejects.toThrow("too_large");
  });
  it("treats an old or damaged cached shape as a miss and removes it", async () => {
    const store = new MemoryCacheStore();
    await store.put("hangout:h1", { hangoutId: "h1", version: "nine" });
    await store.put("prefs", { version: 1, values: { theme: "dark" } });
    const c = new ClientCache(store, "desktop");
    expect(await c.hangout("h1")).toBeUndefined();
    expect(await store.get("hangout:h1")).toBeUndefined();
    expect((await c.preferences()).version).toBe(0);
  });
  it("sign-out uses the store's full wipe when it has one", async () => {
    const store = new MemoryCacheStore();
    let wiped = false;
    store.wipe = async () => { wiped = true; };
    await new ClientCache(store, "desktop").wipeAll();
    expect(wiped).toBe(true);
  });
});

describe("preference updates", () => {
  it("applies the next version, ignores old ones, refetches on a gap, keeps deletions", async () => {
    const c = new ClientCache(new MemoryCacheStore(), "desktop");
    await c.savePreferences({ version: 3, values: { theme: { value: "dark", updatedAt: 10 } } });
    expect(await c.applyPreferencesUpdate({ version: 3, set: {} })).toBe(false);
    expect(await c.applyPreferencesUpdate({ version: 4, set: { theme: { value: null, updatedAt: 20 } } })).toBe(false);
    const p = await c.preferences();
    expect(p.version).toBe(4);
    expect(getPref(p, "theme")).toBeUndefined();
    // An older copy from another device can't bring the deleted key back.
    expect(getPref(mergePreferences(p, { version: 4, values: { theme: { value: "light", updatedAt: 15 } } }), "theme")).toBeUndefined();
    expect(await c.applyPreferencesUpdate({ version: 7, set: {} })).toBe(true);
  });
});

describe("ClientCache", () => {
  it("reports versions for IDENTIFY and applies READY + live updates", async () => {
    const c = new ClientCache(new MemoryCacheStore(), "desktop");
    await c.putHangout(snap(5));
    expect(await c.versions()).toEqual({ prefsVersion: 0, hangouts: { h1: 5 } });
    expect(await c.applyReady({ h1: { kind: "unchanged", version: 5 } })).toEqual([]);
    expect(await c.applyUpdate("h1", { version: 6, patch: [] })).toBe(false);
    expect((await c.hangout("h1"))!.version).toBe(6);
    expect(await c.applyUpdate("h1", { version: 9, patch: [] })).toBe(true);
  });
  it("wipes a hangout on removal and everything on sign-out", async () => {
    const c = new ClientCache(new MemoryCacheStore(), "web");
    await c.putHangout(snap(1));
    await c.applyReady({ h1: { kind: "removed" } });
    expect(await c.hangout("h1")).toBeUndefined();
    await c.putHangout(snap(1));
    await c.savePreferences({ version: 1, values: { theme: { value: "dark", updatedAt: 1 } } });
    await c.wipeAll();
    expect(await c.versions()).toEqual({ prefsVersion: 0, hangouts: {} });
  });
  it("keeps at most 20 hangouts on phones (LRU)", async () => {
    const c = new ClientCache(new MemoryCacheStore(), "web-mobile");
    const evicted: string[] = [];
    for (let i = 0; i < 22; i++) evicted.push(...(await c.putHangout({ ...snap(1), hangoutId: `h${i}` })));
    expect(evicted).toEqual(["h0", "h1"]);
    // Reading a hangout counts as recent use, so it survives the next eviction.
    await c.hangout("h2");
    expect(await c.putHangout({ ...snap(1), hangoutId: "h22" })).toEqual(["h3"]);
    expect(Object.keys((await c.versions()).hangouts)).toHaveLength(20);
  });
});
