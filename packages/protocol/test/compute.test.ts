import { describe, expect, it } from "vitest";
import {
  ALL_BITS, BIT, EVERYONE_FORBIDDEN, FLAG_PENDING, PRESET_ADMIN, PRESET_MEMBER, PRESET_MODERATOR, computePermissions,
  type PermHangout, type PermRoom,
} from "../src";

const H = "h1";
const hangout: PermHangout = {
  id: H,
  ownerId: "owner",
  roles: [
    { id: H, position: 0, permissions: PRESET_MEMBER },
    { id: "mod", position: 5, permissions: PRESET_MODERATOR },
    { id: "admin", position: 9, permissions: BIT.ADMINISTRATOR },
    { id: "muted", position: 1, permissions: 0n },
  ],
};
const room = (over: Partial<PermRoom> = {}): PermRoom => ({ id: "r1", type: "text", categoryId: null, syncWithCategory: false, overrides: [], ...over });
const ov = (targetType: "role" | "member", targetId: string, allow: bigint, deny: bigint) => ({ targetType, targetId, allow: allow.toString(), deny: deny.toString() });
const now = 1_000_000;
const calc = (roleIds: string[], r?: PermRoom, extra: { timeoutUntil?: number; flags?: number; userId?: string; rooms?: Map<string, PermRoom> } = {}) =>
  computePermissions({ hangout, member: { userId: extra.userId ?? "u", roleIds, timeoutUntil: extra.timeoutUntil, flags: extra.flags }, room: r, rooms: extra.rooms, now });

describe("computePermissions (ACCESS_AND_SETTINGS §4)", () => {
  it("owner gets everything, even with deny overrides", () => {
    expect(calc([], room({ overrides: [ov("member", "owner", 0n, ALL_BITS)] }), { userId: "owner" })).toBe(ALL_BITS);
  });
  it("@everyone only → Member preset", () => expect(calc([], room())).toBe(PRESET_MEMBER));
  it("roles are OR-ed", () => expect(calc(["mod"])).toBe(PRESET_MODERATOR));
  it("Administrator skips overrides", () => {
    expect(calc(["admin"], room({ overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] }))).toBe(ALL_BITS);
  });
  it("@everyone deny hides a room", () => expect(calc([], room({ overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] }))).toBe(0n));
  it("role allow beats role deny; member override beats both", () => {
    const r = room({ overrides: [ov("role", H, 0n, BIT.SEND_MESSAGES), ov("role", "mod", BIT.SEND_MESSAGES, 0n), ov("role", "muted", 0n, BIT.SEND_MESSAGES)] });
    expect(calc(["mod", "muted"], r) & BIT.SEND_MESSAGES).toBe(BIT.SEND_MESSAGES);
    const r2 = room({ overrides: [...r.overrides, ov("member", "u", 0n, BIT.SEND_MESSAGES)] });
    expect(calc(["mod", "muted"], r2) & BIT.SEND_MESSAGES).toBe(0n);
  });
  it("synced rooms use the category's overrides; unsynced use their own", () => {
    const cat = room({ id: "c1", type: "category", overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] });
    const rooms = new Map([["c1", cat]]);
    expect(calc([], room({ categoryId: "c1", syncWithCategory: true }), { rooms })).toBe(0n);
    expect(calc([], room({ categoryId: "c1", syncWithCategory: false }), { rooms })).toBe(PRESET_MEMBER);
  });
  it("timeout and pending leave only view + history", () => {
    const ro = BIT.VIEW_ROOM | BIT.READ_HISTORY;
    expect(calc(["mod"], room(), { timeoutUntil: now + 1 })).toBe(ro);
    expect(calc(["mod"], room(), { timeoutUntil: now - 1 })).toBe(PRESET_MODERATOR);
    expect(calc([], room(), { flags: FLAG_PENDING })).toBe(ro);
  });
  it("no SEND_MESSAGES clears attach / embed / mention / polls", () => {
    const p = calc([], room({ overrides: [ov("role", H, 0n, BIT.SEND_MESSAGES)] }));
    for (const b of [BIT.ATTACH_FILES, BIT.EMBED_LINKS, BIT.SEND_POLLS, BIT.SCHEDULE_MESSAGES]) expect(p & b).toBe(0n);
    expect(p & BIT.ADD_REACTIONS).toBe(BIT.ADD_REACTIONS);
  });
  it("a Lounge without CONNECT clears voice bits", () => {
    const p = calc([], room({ type: "lounge", overrides: [ov("role", H, 0n, BIT.CONNECT)] }));
    expect(p & (BIT.SPEAK | BIT.CAMERA | BIT.START_TOGETHER)).toBe(0n);
    expect(p & BIT.VIEW_ROOM).toBe(BIT.VIEW_ROOM);
  });
  it("presets are ordered and @everyone's preset holds no forbidden bit", () => {
    expect(PRESET_MODERATOR & PRESET_MEMBER).toBe(PRESET_MEMBER);
    expect(PRESET_ADMIN & PRESET_MODERATOR).toBe(PRESET_MODERATOR);
    expect(PRESET_MEMBER & EVERYONE_FORBIDDEN).toBe(0n);
    expect(PRESET_ADMIN & BIT.ADMINISTRATOR).toBe(0n);
  });
});
