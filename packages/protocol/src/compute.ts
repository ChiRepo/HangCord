// computePermissions — the one function that decides (ACCESS_AND_SETTINGS §1.2, §4).
// Pure, no I/O: shared by the Workers (authoritative) and the UI (cosmetic only).
// Checkpoint 2 evaluates trusted gate facts; schedule calculation and feature handlers remain server responsibilities.
import { BIT, KNOWN_BITS, ROOM_SCOPED_BITS, parseBits, type PermissionName } from "./permissions";
import type { Override, RoomType } from "./schemas";

const bits = (...names: PermissionName[]) => names.reduce((m, n) => m | BIT[n], 0n);

/** Presets (ACCESS_AND_SETTINGS §3). MEMBER is also the default for @everyone in a new hangout. */
export const PRESET_MEMBER = bits(
  "VIEW_ROOM", "READ_HISTORY", "SEND_MESSAGES", "SEND_IN_STRANDS", "CREATE_PUBLIC_STRANDS", "EMBED_LINKS", "ATTACH_FILES",
  "ADD_REACTIONS", "USE_EXTERNAL_EXPRESSIONS", "SEND_VOICE_MESSAGES", "SEND_POLLS", "USE_COMMANDS", "SCHEDULE_MESSAGES",
  "CONNECT", "SPEAK", "CAMERA", "SHARE_SCREEN", "USE_VOICE_ACTIVITY", "USE_SOUNDBOARD", "REQUEST_TO_SPEAK", "START_TOGETHER",
  "USE_WHITEBOARD", "USE_AI_CATCHUP", "USE_TRANSLATION", "CREATE_INVITES", "CREATE_EVENTS", "CHANGE_NICKNAME", "CREATE_EXPRESSIONS",
);
export const PRESET_MODERATOR = PRESET_MEMBER | bits(
  "PIN_MESSAGES", "MANAGE_MESSAGES", "MANAGE_STRANDS", "BYPASS_SLOWMODE", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS",
  "CONTROL_TOGETHER", "MANAGE_WHITEBOARD", "MANAGE_NICKNAMES", "TIMEOUT_MEMBERS", "KICK_MEMBERS", "VIEW_AUDIT_LOG",
  "VIEW_SAFETY_ALERTS", "MANAGE_SECURITY_ACTIONS", "VIEW_AS_ROLE",
);
export const PRESET_ADMIN = PRESET_MODERATOR | bits(
  "MANAGE_ROOMS", "MANAGE_ROOM_PERMISSIONS", "MANAGE_ROLES", "MANAGE_EVENTS", "MANAGE_EXPRESSIONS", "MANAGE_INVITES",
  "MANAGE_WEBHOOKS", "BAN_MEMBERS", "MANAGE_AUTOMOD", "MANAGE_HANGOUT", "VIEW_INSIGHTS", "MENTION_EVERYONE",
);
/** Bits @everyone may never hold (ACCESS_AND_SETTINGS §2). */
export const EVERYONE_FORBIDDEN = bits("ADMINISTRATOR", "BAN_MEMBERS", "KICK_MEMBERS", "MANAGE_ROLES", "MANAGE_HANGOUT", "MANAGE_ROOMS");

export const ALL_BITS = KNOWN_BITS;
/** Member flag: hasn't accepted the rules yet (§9). */
export const FLAG_PENDING = 1;

export const FLAG_BYPASS_VERIFICATION = 8;
export const FLAG_QUARANTINED = 16;
export type VerificationLevel = 0 | 1 | 2 | 3 | 4;
export interface PermRole { id: string; position: number; permissions: bigint }
export interface PermMember {
  userId: string; roleIds: string[]; timeoutUntil?: number | null; flags?: number;
  emailVerified?: boolean; accountCreatedAt?: number; joinedAt?: number; adultConfirmed?: boolean;
}
export interface PermHangout {
  id: string; ownerId: string; roles: PermRole[]; verificationLevel?: VerificationLevel;
  invitesPausedUntil?: number | null;
}
export interface PermRoom {
  id: string; type: RoomType | "strand"; categoryId?: string | null; syncWithCategory: boolean; overrides: Override[];
  ageRestricted?: boolean; hasSchedule?: boolean; scheduleOpen?: boolean;
  parentRoomId?: string; private?: boolean; memberIds?: string[];
}
export interface PermissionContext {
  hangout: PermHangout; member: PermMember; room?: PermRoom; rooms?: ReadonlyMap<string, PermRoom>; now: number;
}
export interface ExplainStep {
  step: string; source: "role" | "override" | "timeout" | "screening" | "verification" | "implicit" | "policy" | "validation";
  id: string; bit: PermissionName | null; from: boolean; to: boolean;
}
export interface PermissionResult { bits: bigint; explain: ExplainStep[] }

const VOICE_BITS = bits(
  "CONNECT", "SPEAK", "CAMERA", "SHARE_SCREEN", "USE_VOICE_ACTIVITY", "PRIORITY_SPEAKER", "USE_SOUNDBOARD", "SET_LOUNGE_STATUS",
  "REQUEST_TO_SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "START_TOGETHER", "CONTROL_TOGETHER", "USE_WHITEBOARD", "MANAGE_WHITEBOARD",
);
const NEEDS_SEND = bits("MENTION_EVERYONE", "ATTACH_FILES", "EMBED_LINKS", "SEND_VOICE_MESSAGES", "SEND_POLLS", "SCHEDULE_MESSAGES");
const READ_ONLY = bits("VIEW_ROOM", "READ_HISTORY");
const isTimestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validBits = (value: bigint) => typeof value === "bigint" && value >= 0n && (value & ~KNOWN_BITS) === 0n;

function gateSatisfied(hangout: PermHangout, member: PermMember, now: number): boolean {
  const level = hangout.verificationLevel ?? 0;
  if (![0, 1, 2, 3, 4].includes(level)) return false;
  if (((member.flags ?? 0) & FLAG_BYPASS_VERIFICATION) !== 0) return true;
  if (level === 0) return true;
  if (member.emailVerified !== true) return false;
  if (level === 1) return true;
  if (!isTimestamp(member.accountCreatedAt) || now - member.accountCreatedAt < 86_400_000) return false;
  if (level === 2) return true;
  if (!isTimestamp(member.joinedAt) || now - member.joinedAt < 600_000) return false;
  return level !== 4 || now - member.accountCreatedAt >= 604_800_000;
}

/** Effective bits for `member` in `room` (or hangout-wide when room is undefined).
 * `rooms` resolves synced categories and Strand parents from authoritative current state.
 */
export function computePermissions(ctx: PermissionContext): bigint { return evaluate(ctx, new Set()).bits; }
export function explainPermissions(ctx: PermissionContext): PermissionResult { return evaluate(ctx, new Set()); }

function evaluate(ctx: PermissionContext, visited: Set<string>): PermissionResult {
  const { hangout, member, room, now } = ctx;
  let p = 0n;
  const explain: ExplainStep[] = [];
  const change = (next: bigint, step: string, source: ExplainStep["source"], id: string) => {
    for (const [name, bit] of Object.entries(BIT) as [PermissionName, bigint][]) {
      if (((p ^ next) & bit) !== 0n) explain.push({ step, source, id, bit: name, from: (p & bit) !== 0n, to: (next & bit) !== 0n });
    }
    p = next;
  };
  const deny = (step: string): PermissionResult => {
    change(0n, step, "validation", room?.id ?? hangout.id);
    explain.push({ step, source: "validation", id: room?.id ?? hangout.id, bit: null, from: false, to: false });
    return { bits: 0n, explain };
  };
  if (!hangout.id || !hangout.ownerId || !member.userId || !isTimestamp(now)) return deny("invalid-context");
  if (member.userId === hangout.ownerId) {
    change(ALL_BITS, "owner", "role", member.userId);
    return { bits: p, explain };
  }
  const roleById = new Map<string, PermRole>();
  for (const role of hangout.roles) {
    if (!role.id || roleById.has(role.id) || !validBits(role.permissions) || !Number.isSafeInteger(role.position) || role.position < 0) return deny("invalid-role");
    roleById.set(role.id, role);
  }
  const everyone = roleById.get(hangout.id);
  if (!everyone || everyone.position !== 0 || (everyone.permissions & EVERYONE_FORBIDDEN) !== 0n) return deny("invalid-everyone");
  const flags = member.flags ?? 0;
  if (!Number.isSafeInteger(flags) || flags < 0 || flags > 31 || (member.timeoutUntil != null && !isTimestamp(member.timeoutUntil))) return deny("invalid-member-state");
  if (new Set(member.roleIds).size !== member.roleIds.length || member.roleIds.some((id) => !roleById.has(id))) return deny("unknown-member-role");
  change(everyone.permissions, "everyone", "role", hangout.id);
  for (const id of member.roleIds) change(p | roleById.get(id)!.permissions, "member-role", "role", id);
  if ((p & BIT.ADMINISTRATOR) !== 0n) {
    change(ALL_BITS, "administrator", "role", member.userId);
    return { bits: p, explain };
  }
  if (room) {
    if (!room.id || visited.has(room.id)) return deny("cyclic-room");
    visited.add(room.id);
    if (room.type === "strand") {
      const parent = room.parentRoomId ? ctx.rooms?.get(room.parentRoomId) : undefined;
      if (!parent || parent.id !== room.parentRoomId || parent.type === "category" || parent.type === "strand") return deny("missing-strand-parent");
      const inherited = evaluate({ ...ctx, room: parent }, visited);
      explain.push(...inherited.explain);
      change(inherited.bits, "strand-parent", "implicit", parent.id);
      if (room.private && !room.memberIds?.includes(member.userId) && (p & BIT.MANAGE_STRANDS) === 0n) return deny("private-strand");
    } else {
      let source = room;
      if (room.syncWithCategory) {
        const cat = room.categoryId ? ctx.rooms?.get(room.categoryId) : undefined;
        if (!cat || cat.id !== room.categoryId || cat.id === room.id || cat.type !== "category" || cat.syncWithCategory || cat.categoryId) return deny("missing-synced-category");
        source = cat;
      }
      const targets = new Set<string>();
      const overrides = [];
      for (const override of source.overrides) {
        const allow = parseBits(override.allow), denyBits = parseBits(override.deny);
        const key = `${override.targetType}:${override.targetId}`;
        if (!override.targetId || !["role", "member"].includes(override.targetType) || targets.has(key) || allow === null || denyBits === null || ((allow | denyBits) & ~ROOM_SCOPED_BITS) !== 0n || (allow & denyBits) !== 0n) return deny("invalid-override");
        targets.add(key); overrides.push({ ...override, allow, deny: denyBits });
      }
      const ev = overrides.find((o) => o.targetType === "role" && o.targetId === hangout.id);
      if (ev) change((p & ~ev.deny) | ev.allow, "everyone-override", "override", hangout.id);
      let rd = 0n, ra = 0n;
      for (const id of member.roleIds) {
        if (id === hangout.id) continue;
        const o = overrides.find((o) => o.targetType === "role" && o.targetId === id);
        if (o) { rd |= o.deny; ra |= o.allow; }
      }
      change((p & ~rd) | ra, "role-overrides", "override", source.id); // role allow beats role deny
      const mo = overrides.find((o) => o.targetType === "member" && o.targetId === member.userId);
      if (mo) change((p & ~mo.deny) | mo.allow, "member-override", "override", member.userId);
    }
  }
  if ((member.timeoutUntil ?? 0) > now) change(p & READ_ONLY, "timeout", "timeout", member.userId);
  if ((flags & (FLAG_PENDING | FLAG_QUARANTINED)) !== 0) change(p & READ_ONLY, "screening", "screening", member.userId);
  if (!gateSatisfied(hangout, member, now)) change(p & READ_ONLY, "verification", "verification", member.userId);
  if (room) {
    if (room.ageRestricted && member.adultConfirmed !== true) change(0n, "adult-confirmation", "implicit", room.id);
    if ((room.hasSchedule && room.scheduleOpen !== true || room.scheduleOpen === false) && (p & BIT.MANAGE_ROOMS) === 0n) {
      change(p & ~(BIT.SEND_MESSAGES | BIT.SEND_IN_STRANDS | BIT.CONNECT), "closed-schedule", "implicit", room.id);
    }
    if ((p & BIT.VIEW_ROOM) === 0n) change(0n, "view-required", "implicit", room.id);
    const send = room.type === "strand" ? BIT.SEND_IN_STRANDS : BIT.SEND_MESSAGES;
    if ((p & send) === 0n) change(p & ~NEEDS_SEND, "send-required", "implicit", room.id);
    if ((room.type === "lounge" || room.type === "spotlight") && (p & BIT.CONNECT) === 0n) change(p & ~VOICE_BITS, "connect-required", "implicit", room.id);
  }
  if (hangout.invitesPausedUntil != null && !isTimestamp(hangout.invitesPausedUntil)) return deny("invalid-invite-policy");
  if ((hangout.invitesPausedUntil ?? 0) > now) change(p & ~BIT.CREATE_INVITES, "invites-paused", "policy", hangout.id);
  return { bits: p, explain };
}

const MODERATION = {
  kick: "KICK_MEMBERS", ban: "BAN_MEMBERS", timeout: "TIMEOUT_MEMBERS", nickname: "MANAGE_NICKNAMES",
  move: "MOVE_MEMBERS", mute: "MUTE_MEMBERS", deafen: "DEAFEN_MEMBERS",
} as const;
export type ModerationAction = keyof typeof MODERATION;
/** Hierarchy is additional to effective permissions, never an Administrator bypass. */
export function canModerate(ctx: PermissionContext, target: PermMember, action: ModerationAction): boolean {
  const permission = MODERATION[action];
  if (!permission || target.userId === ctx.hangout.ownerId || target.userId === ctx.member.userId || (computePermissions(ctx) & BIT[permission]) === 0n) return false;
  const roles = new Map(ctx.hangout.roles.map((r) => [r.id, r]));
  if (!target.userId || target.roleIds.some((id) => !roles.has(id))) return false;
  if (action === "timeout" && target.roleIds.some((id) => (roles.get(id)!.permissions & BIT.ADMINISTRATOR) !== 0n)) return false;
  if (ctx.member.userId === ctx.hangout.ownerId) return true;
  const highest = (member: PermMember) => Math.max(0, ...member.roleIds.map((id) => roles.get(id)?.position ?? 0));
  return highest(ctx.member) > highest(target);
}
