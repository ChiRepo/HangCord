import { describe, expect, it } from "vitest";
import { planNewRoom, slugRoomName, liveSlug, BIT, type Room } from "../src";

const deny = (b: bigint) => String(b);
const category: Room = {
  id: "cat1", hangoutId: "h1", type: "category", position: 0, name: "Study", syncWithCategory: false,
  overrides: [{ targetType: "role", targetId: "everyone", allow: "0", deny: deny(BIT.VIEW_ROOM) }],
  roomDefaults: { slowmode: 10, notifyDefault: "mentions" },
  guidelinesText: "Be kind. No spoilers.",
};
const creatorBits = BIT.VIEW_ROOM | BIT.SEND_MESSAGES | BIT.MANAGE_ROOMS;
const base = { hangoutId: "h1", newId: "r9", canManageRooms: true, canManageRoomPermissions: true, creatorBits, category, roomsInCategory: 3, roomsInHangout: 20 };
const req = (r: Partial<Parameters<typeof planNewRoom>[0]["req"]>) => ({ type: "text" as const, name: "x", categoryId: "cat1", guidelines: "category" as const, ...r });

describe("+ add room from a category (ACCESS_AND_SETTINGS §7.1)", () => {
  it("follow category guidelines: synced copy of overrides, defaults and text", () => {
    const r = planNewRoom({ ...base, req: req({ name: "Exam Prep" }) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.room).toMatchObject({ syncWithCategory: true, name: "exam-prep", position: 3, guidelinesText: "Be kind. No spoilers." });
    expect(r.room.overrides).toEqual(category.overrides);
    expect(r.room.settings).toEqual({ slowmode: 10, notifyDefault: "mentions" });
  });

  it("own guidelines without overrides start as an exact copy", () => {
    const r = planNewRoom({ ...base, req: req({ type: "lounge", name: " Quiet   Lounge ", guidelines: "own", settings: { userLimit: 5 } }) });
    expect(r.ok && r.room.syncWithCategory).toBe(false);
    if (!r.ok) return;
    expect(r.room.overrides).toEqual(category.overrides);
    expect(r.room.settings).toEqual({ slowmode: 10, notifyDefault: "mentions", userLimit: 5 });
    expect(r.room.name).toBe("Quiet Lounge");
  });

  it("removing a category deny counts as opening that bit", () => {
    // Empty override list would make a private category's room public.
    expect(planNewRoom({ ...base, creatorBits: 0n, req: req({ guidelines: "own", overrides: [] }) })).toEqual({ ok: false, error: "grants_exceed_creator" });
    // Allowed when the creator holds VIEW_ROOM themselves.
    expect(planNewRoom({ ...base, req: req({ guidelines: "own", overrides: [] }) }).ok).toBe(true);
  });

  it("new allow bits must be held by the creator", () => {
    const o = [{ targetType: "role" as const, targetId: "everyone", allow: String(BIT.MENTION_EVERYONE), deny: deny(BIT.VIEW_ROOM) }];
    expect(planNewRoom({ ...base, req: req({ guidelines: "own", overrides: o }) })).toEqual({ ok: false, error: "grants_exceed_creator" });
  });

  it("tightening is fine; any change needs MANAGE_ROOM_PERMISSIONS", () => {
    const tighter = [{ targetType: "role" as const, targetId: "everyone", allow: "0", deny: String(BIT.VIEW_ROOM | BIT.SEND_MESSAGES) }];
    expect(planNewRoom({ ...base, creatorBits: 0n, req: req({ guidelines: "own", overrides: tighter }) }).ok).toBe(true);
    expect(planNewRoom({ ...base, canManageRoomPermissions: false, req: req({ guidelines: "own", overrides: tighter }) })).toEqual({ ok: false, error: "needs_manage_room_permissions" });
    // Unchanged copy doesn't need it.
    expect(planNewRoom({ ...base, canManageRoomPermissions: false, req: req({ guidelines: "own", overrides: category.overrides }) }).ok).toBe(true);
  });

  it("rejects unknown, oversized, hangout-only, contradictory and duplicate bits", () => {
    const bad = (allow: string, d = "0") => planNewRoom({ ...base, req: req({ guidelines: "own", overrides: [{ targetType: "role", targetId: "everyone", allow, deny: d }] }) });
    expect(bad(String(1n << 61n))).toEqual({ ok: false, error: "bad_bits" });
    expect(bad("0", "18446744073709551615999")).toEqual({ ok: false, error: "bad_bits" });
    expect(bad(String(BIT.ADMINISTRATOR))).toEqual({ ok: false, error: "bad_bits" });
    expect(bad(String(BIT.SPEAK), String(BIT.SPEAK))).toEqual({ ok: false, error: "bad_bits" });
    const dup = [{ targetType: "role" as const, targetId: "a", allow: "0", deny: "0" }, { targetType: "role" as const, targetId: "a", allow: "0", deny: "0" }];
    expect(planNewRoom({ ...base, req: req({ guidelines: "own", overrides: dup }) })).toEqual({ ok: false, error: "bad_bits" });
  });

  it("enforces permission, category shape, nesting, names and limits", () => {
    expect(planNewRoom({ ...base, canManageRooms: false, req: req({}) })).toEqual({ ok: false, error: "forbidden" });
    expect(planNewRoom({ ...base, roomsInCategory: 50, req: req({}) })).toEqual({ ok: false, error: "category_full" });
    expect(planNewRoom({ ...base, roomsInHangout: 500, req: req({}) })).toEqual({ ok: false, error: "hangout_full" });
    expect(planNewRoom({ ...base, category: { ...category, type: "text" }, req: req({}) })).toEqual({ ok: false, error: "not_a_category" });
    expect(planNewRoom({ ...base, req: req({ categoryId: null }) })).toEqual({ ok: false, error: "not_a_category" });
    expect(planNewRoom({ ...base, req: req({ type: "category" }) })).toEqual({ ok: false, error: "nested_category" });
    expect(planNewRoom({ ...base, req: req({ type: "lounge", name: "   " }) })).toEqual({ ok: false, error: "bad_name" });
    expect(planNewRoom({ ...base, req: req({ name: "!!!" }) })).toEqual({ ok: false, error: "bad_name" });
  });

  it("validates settings: known keys and ranges only", () => {
    expect(planNewRoom({ ...base, req: req({ type: "lounge", name: "L", guidelines: "own", settings: { userLimit: 500 } }) })).toEqual({ ok: false, error: "bad_settings" });
    expect(planNewRoom({ ...base, req: req({ guidelines: "own", settings: { isAdmin: true } }) })).toEqual({ ok: false, error: "bad_settings" });
    expect(planNewRoom({ ...base, req: req({ guidelines: "own", settings: { slowmode: 30 } }) }).ok).toBe(true);
  });

  it("rooms outside any category can't be synced", () => {
    const r = planNewRoom({ ...base, category: null, roomsInCategory: 0, req: req({ name: "lobby", categoryId: null }) });
    expect(r.ok && r.room.syncWithCategory).toBe(false);
  });

  it("slugs names the same way on client and server", () => {
    expect(slugRoomName("  Late   Night!! Study ")).toBe("late-night-study");
    expect(slugRoomName("हिंदी चैट")).toBe("हिंदी-चैट");
    expect(liveSlug("Movie ")).toBe("movie-");
    expect(slugRoomName("Movie ")).toBe("movie");
  });
});
