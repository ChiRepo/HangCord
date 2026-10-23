import { describe, expect, it } from "vitest";
import {
  ALL_BITS, BIT, EVERYONE_FORBIDDEN, FLAG_BYPASS_VERIFICATION, FLAG_PENDING, FLAG_QUARANTINED,
  PRESET_ADMIN, PRESET_MEMBER, PRESET_MODERATOR, canModerate, computePermissions, explainPermissions,
  type PermHangout, type PermMember, type PermRoom, type PermissionContext,
} from "../src";

const H = "h1";
const hangout: PermHangout = {
  id: H, ownerId: "owner", roles: [
    { id: H, position: 0, permissions: PRESET_MEMBER },
    { id: "mod", position: 5, permissions: PRESET_MODERATOR },
    { id: "admin", position: 9, permissions: BIT.ADMINISTRATOR },
    { id: "muted", position: 1, permissions: 0n },
    { id: "higher", position: 10, permissions: PRESET_MODERATOR },
  ],
};
const room = (over: Partial<PermRoom> = {}): PermRoom => ({ id: "r1", type: "text", categoryId: null, syncWithCategory: false, overrides: [], ...over });
const ov = (targetType: "role" | "member", targetId: string, allow: bigint, deny: bigint) => ({ targetType, targetId, allow: allow.toString(), deny: deny.toString() });
const now = 1_000_000_000;
const member = (over: Partial<PermMember> = {}): PermMember => ({ userId: "u", roleIds: [], ...over });
const context = (over: Partial<PermissionContext> = {}): PermissionContext => ({ hangout, member: member(), room: room(), now, ...over });
const calc = (roleIds: string[], r?: PermRoom, extra: Partial<PermMember> = {}, h: PermHangout = hangout, rooms?: Map<string, PermRoom>) =>
  computePermissions({ hangout: h, member: member({ roleIds, ...extra }), room: r, rooms, now });
const READ_ONLY = BIT.VIEW_ROOM | BIT.READ_HISTORY;

describe("computePermissions (ACCESS_AND_SETTINGS §4)", () => {
  it("owner gets every known bit before role and room validation", () => {
    expect(calc([], room({ overrides: [ov("member", "owner", 0n, ALL_BITS)] }), { userId: "owner" }, { ...hangout, roles: [] })).toBe(ALL_BITS);
  });
  it("@everyone only gets the Member preset and roles are OR-ed", () => {
    expect(calc([], room())).toBe(PRESET_MEMBER);
    expect(calc(["mod"], undefined)).toBe(PRESET_MODERATOR);
    expect(calc(["mod", "muted"], undefined)).toBe(PRESET_MODERATOR);
  });
  it("Administrator skips overrides, screening, gates, timeout and policies", () => {
    const h = { ...hangout, verificationLevel: 99 as 0, invitesPausedUntil: now + 1 };
    expect(calc(["admin"], room({ overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] }), { flags: FLAG_PENDING, timeoutUntil: now + 1 }, h)).toBe(ALL_BITS);
  });
  it("applies @everyone, combined role, then member override precedence", () => {
    const r = room({ overrides: [ov("role", H, 0n, BIT.SEND_MESSAGES), ov("role", "mod", BIT.SEND_MESSAGES, 0n), ov("role", "muted", 0n, BIT.SEND_MESSAGES)] });
    expect(calc(["mod", "muted"], r) & BIT.SEND_MESSAGES).toBe(BIT.SEND_MESSAGES);
    expect(calc(["mod", "muted"], room({ overrides: [...r.overrides, ov("member", "u", 0n, BIT.SEND_MESSAGES)] })) & BIT.SEND_MESSAGES).toBe(0n);
  });
  it("uses synced category overrides and child overrides when unsynced", () => {
    const cat = room({ id: "c1", type: "category", overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] });
    const rooms = new Map([["c1", cat]]);
    expect(calc([], room({ categoryId: "c1", syncWithCategory: true }), {}, hangout, rooms)).toBe(0n);
    expect(calc([], room({ categoryId: "c1", syncWithCategory: false }), {}, hangout, rooms)).toBe(PRESET_MEMBER);
  });
  it("pending and quarantined members retain only view/history; bypass only skips verification", () => {
    expect(calc(["mod"], room(), { flags: FLAG_PENDING })).toBe(READ_ONLY);
    expect(calc(["mod"], room(), { flags: FLAG_QUARANTINED })).toBe(READ_ONLY);
    const h = { ...hangout, verificationLevel: 4 as const };
    const verified = { emailVerified: true, accountCreatedAt: now - 8 * 86_400_000, joinedAt: now - 700_000 };
    expect(calc(["mod"], room(), { ...verified, flags: FLAG_BYPASS_VERIFICATION }, h)).toBe(PRESET_MODERATOR);
    expect(calc(["mod"], room(), { ...verified, flags: FLAG_BYPASS_VERIFICATION | FLAG_QUARANTINED }, h)).toBe(READ_ONLY);
  });
  it("enforces each cumulative verification level and exact age boundaries", () => {
    const h = (verificationLevel: 0 | 1 | 2 | 3 | 4): PermHangout => ({ ...hangout, verificationLevel });
    const facts = { emailVerified: true, accountCreatedAt: now - 7 * 86_400_000, joinedAt: now - 600_000 };
    for (const level of [0, 1, 2, 3, 4] as const) expect(calc([], room(), facts, h(level))).toBe(PRESET_MEMBER);
    expect(calc([], room(), {}, h(1))).toBe(READ_ONLY);
    expect(calc([], room(), { emailVerified: true }, h(2))).toBe(READ_ONLY);
    expect(calc([], room(), { ...facts, accountCreatedAt: now - 86_400_000 + 1 }, h(2))).toBe(READ_ONLY);
    expect(calc([], room(), { ...facts, joinedAt: now - 599_999 }, h(3))).toBe(READ_ONLY);
    expect(calc([], room(), { ...facts, accountCreatedAt: now - 7 * 86_400_000 + 1 }, h(4))).toBe(READ_ONLY);
  });
  it("unknown verification level and invalid, future, or absent gate facts fail closed", () => {
    expect(calc([], room(), {}, { ...hangout, verificationLevel: 8 as 0 })).toBe(READ_ONLY);
    expect(calc([], room(), { emailVerified: true, accountCreatedAt: now + 1 }, { ...hangout, verificationLevel: 2 })).toBe(READ_ONLY);
    expect(calc([], room(), { emailVerified: true, accountCreatedAt: now - 2 * 86_400_000, joinedAt: now + 1 }, { ...hangout, verificationLevel: 3 })).toBe(READ_ONLY);
  });
  it("rejects malformed roles, assigned role ids, @everyone and override masks", () => {
    expect(calc(["absent"], room())).toBe(0n);
    expect(calc(["mod", "mod"], room())).toBe(0n);
    expect(calc([], room(), {}, { ...hangout, roles: hangout.roles.filter((r) => r.id !== H) })).toBe(0n);
    expect(calc([], room(), {}, { ...hangout, roles: [{ ...hangout.roles[0]!, permissions: BIT.ADMINISTRATOR }, ...hangout.roles.slice(1)] })).toBe(0n);
    expect(calc([], room(), {}, { ...hangout, roles: [{ ...hangout.roles[0]!, permissions: 1n << 63n }, ...hangout.roles.slice(1)] })).toBe(0n);
    for (const overrides of [
      [ov("role", H, BIT.MANAGE_NICKNAMES, 0n)],
      [ov("role", H, BIT.VIEW_ROOM, BIT.VIEW_ROOM)],
      [ov("role", H, BIT.VIEW_ROOM, 0n), ov("role", H, 0n, 0n)],
      [{ ...ov("role", H, 0n, 0n), allow: "not-decimal" }],
    ]) expect(calc([], room({ overrides }))).toBe(0n);
  });
  it("applies timeout, view, send, and lounge-connect implicit masks", () => {
    expect(calc(["mod"], room(), { timeoutUntil: now + 1 })).toBe(READ_ONLY);
    expect(calc(["mod"], room(), { timeoutUntil: now })).toBe(PRESET_MODERATOR);
    const noSend = calc([], room({ overrides: [ov("role", H, 0n, BIT.SEND_MESSAGES)] }));
    for (const b of [BIT.MENTION_EVERYONE, BIT.ATTACH_FILES, BIT.EMBED_LINKS, BIT.SEND_POLLS, BIT.SCHEDULE_MESSAGES]) expect(noSend & b).toBe(0n);
    expect(noSend & BIT.ADD_REACTIONS).toBe(BIT.ADD_REACTIONS);
    const lounge = calc([], room({ type: "lounge", overrides: [ov("role", H, 0n, BIT.CONNECT)] }));
    expect(lounge & (BIT.SPEAK | BIT.CAMERA | BIT.START_TOGETHER)).toBe(0n);
    expect(lounge & BIT.VIEW_ROOM).toBe(BIT.VIEW_ROOM);
    expect(calc([], room({ overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] }))).toBe(0n);
  });
  it("requires adult confirmation and applies scheduled-room closure and manager bypass", () => {
    expect(calc([], room({ ageRestricted: true }))).toBe(0n);
    expect(calc([], room({ ageRestricted: true }), { adultConfirmed: true })).toBe(PRESET_MEMBER);
    const scheduled = room({ hasSchedule: true, scheduleOpen: true });
    const closed = room({ hasSchedule: true, scheduleOpen: false });
    const expected = PRESET_MEMBER & ~(BIT.SEND_MESSAGES | BIT.SEND_IN_STRANDS | BIT.CONNECT | BIT.ATTACH_FILES | BIT.EMBED_LINKS | BIT.SEND_VOICE_MESSAGES | BIT.SEND_POLLS | BIT.SCHEDULE_MESSAGES);
    expect(calc([], scheduled)).toBe(PRESET_MEMBER);
    expect(calc([], closed)).toBe(expected);
    expect(calc([], room({ hasSchedule: true }))).toBe(expected);
    expect(calc(["mod"], closed)).toBe(PRESET_MODERATOR & ~(BIT.SEND_MESSAGES | BIT.SEND_IN_STRANDS | BIT.CONNECT | BIT.ATTACH_FILES | BIT.EMBED_LINKS | BIT.SEND_VOICE_MESSAGES | BIT.SEND_POLLS | BIT.SCHEDULE_MESSAGES));
    expect(calc(["admin"], closed)).toBe(ALL_BITS);
  });
  it("inherits Strand parent access and restricts private Strands", () => {
    const parent = room();
    const strand = room({ id: "s1", type: "strand", parentRoomId: parent.id });
    const rooms = new Map([[parent.id, parent]]);
    expect(calc([], strand, {}, hangout, rooms)).toBe(PRESET_MEMBER);
    expect(calc([], { ...strand, private: true }, {}, hangout, rooms)).toBe(0n);
    expect(calc([], { ...strand, private: true, memberIds: ["u"] }, {}, hangout, rooms)).toBe(PRESET_MEMBER);
    expect(calc(["mod"], { ...strand, private: true }, {}, hangout, rooms)).toBe(PRESET_MODERATOR);
    expect(calc([], { ...strand, parentRoomId: "missing" }, {}, hangout, rooms)).toBe(0n);
    const hiddenParent = room({ overrides: [ov("role", H, 0n, BIT.VIEW_ROOM)] });
    expect(calc([], strand, {}, hangout, new Map([[parent.id, hiddenParent]]))).toBe(0n);
  });
  it("pauses invite creation for ordinary members and validates policy timestamps", () => {
    expect(calc([]) & BIT.CREATE_INVITES).toBe(BIT.CREATE_INVITES);
    expect(calc([], undefined, {}, { ...hangout, invitesPausedUntil: now + 1 }) & BIT.CREATE_INVITES).toBe(0n);
    expect(calc([], undefined, {}, { ...hangout, invitesPausedUntil: now }) & BIT.CREATE_INVITES).toBe(BIT.CREATE_INVITES);
    expect(calc([], undefined, {}, { ...hangout, invitesPausedUntil: -1 }) ).toBe(0n);
  });
  it("exposes the same result with useful explain steps", () => {
    const result = explainPermissions(context({ member: member({ flags: FLAG_PENDING }) }));
    expect(result.bits).toBe(READ_ONLY);
    expect(result.explain.some((s) => s.step === "screening" && s.source === "screening")).toBe(true);
  });
  it("keeps presets ordered and @everyone free of forbidden bits", () => {
    expect(PRESET_MODERATOR & PRESET_MEMBER).toBe(PRESET_MEMBER);
    expect(PRESET_ADMIN & PRESET_MODERATOR).toBe(PRESET_MODERATOR);
    expect(PRESET_MEMBER & EVERYONE_FORBIDDEN).toBe(0n);
    expect(PRESET_ADMIN & BIT.ADMINISTRATOR).toBe(0n);
  });
});

describe("canModerate (ACCESS_AND_SETTINGS §5)", () => {
  const actor = (roleIds: string[], userId = "actor") => context({ member: member({ userId, roleIds }), room: undefined });
  const target = (roleIds: string[] = [], userId = "target"): PermMember => member({ userId, roleIds });
  it("requires permission and a strictly higher role, except for the owner", () => {
    expect(canModerate(actor(["mod"]), target(), "kick")).toBe(true);
    expect(canModerate(actor(["mod"]), target(["mod"]), "kick")).toBe(false);
    expect(canModerate(actor(["muted"]), target(), "kick")).toBe(false);
    expect(canModerate(actor([], "owner"), target(["higher"]), "kick")).toBe(true);
  });
  it("rejects owner, self, unknown targets and timeout of Administrators", () => {
    expect(canModerate(actor(["higher"]), target([], "owner"), "kick")).toBe(false);
    expect(canModerate(actor(["mod"], "actor"), target([], "actor"), "kick")).toBe(false);
    expect(canModerate(actor(["higher"]), target(["missing"]), "kick")).toBe(false);
    expect(canModerate(actor(["higher"]), target(["admin"]), "timeout")).toBe(false);
    expect(canModerate(actor(["higher"]), target(["admin"]), "ban")).toBe(false);
  });
  it("maps each moderation action to its documented permission", () => {
    const actions = [
      ["kick", "KICK_MEMBERS"], ["ban", "BAN_MEMBERS"], ["timeout", "TIMEOUT_MEMBERS"],
      ["nickname", "MANAGE_NICKNAMES"], ["move", "MOVE_MEMBERS"], ["mute", "MUTE_MEMBERS"], ["deafen", "DEAFEN_MEMBERS"],
    ] as const;
    for (const [action, permission] of actions) {
      const h = { ...hangout, roles: hangout.roles.map((r) => r.id === "mod" ? { ...r, permissions: BIT[permission] } : r) };
      expect(canModerate({ ...actor(["mod"]), hangout: h }, target(), action)).toBe(true);
    }
  });
});
