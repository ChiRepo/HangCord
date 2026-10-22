// computePermissions — the one function that decides (ACCESS_AND_SETTINGS §1.2, §4).
// Pure, no I/O: shared by the Workers (authoritative) and the UI (cosmetic only).
// cp-002 implements steps 1–7 and 9 (VIEW / SEND / Lounge-CONNECT implicit rules). Verification gates (step 8),
// Strands, age gates, room schedules and hangout kill switches arrive with their features.
import { BIT, KNOWN_BITS, type PermissionName } from "./permissions";
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

export interface PermRole { id: string; position: number; permissions: bigint }
export interface PermMember { userId: string; roleIds: string[]; timeoutUntil?: number | null; flags?: number }
export interface PermHangout { id: string; ownerId: string; roles: PermRole[] /* includes @everyone (id = hangout id) */ }
export interface PermRoom { id: string; type: RoomType; categoryId?: string | null; syncWithCategory: boolean; overrides: Override[] }

const VOICE_BITS = bits(
  "CONNECT", "SPEAK", "CAMERA", "SHARE_SCREEN", "USE_VOICE_ACTIVITY", "PRIORITY_SPEAKER", "USE_SOUNDBOARD", "SET_LOUNGE_STATUS",
  "REQUEST_TO_SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "START_TOGETHER", "CONTROL_TOGETHER", "USE_WHITEBOARD", "MANAGE_WHITEBOARD",
);
const NEEDS_SEND = bits("MENTION_EVERYONE", "ATTACH_FILES", "EMBED_LINKS", "SEND_VOICE_MESSAGES", "SEND_POLLS", "SCHEDULE_MESSAGES");
const READ_ONLY = bits("VIEW_ROOM", "READ_HISTORY");

/**
 * Effective bits for `member` in `room` (or hangout-wide when room is undefined).
 * `rooms` lets a synced room use its category's overrides.
 */
export function computePermissions(ctx: {
  hangout: PermHangout;
  member: PermMember;
  room?: PermRoom;
  rooms?: ReadonlyMap<string, PermRoom>;
  now: number;
}): bigint {
  const { hangout, member, room, now } = ctx;
  if (member.userId === hangout.ownerId) return ALL_BITS; // 1. owner
  const roleById = new Map(hangout.roles.map((r) => [r.id, r]));
  let base = roleById.get(hangout.id)?.permissions ?? 0n; // 2. @everyone
  for (const id of member.roleIds) base |= roleById.get(id)?.permissions ?? 0n; // 3. OR all roles
  if ((base & BIT.ADMINISTRATOR) !== 0n) return ALL_BITS; // 4. admin
  let p = base;
  if (room) {
    // 5. overrides: the room's own, or its category's when synced
    const cat = room.syncWithCategory && room.categoryId ? ctx.rooms?.get(room.categoryId) : undefined;
    const ow = cat ? cat.overrides : room.overrides;
    const find = (type: "role" | "member", id: string) => ow.find((o) => o.targetType === type && o.targetId === id);
    const ev = find("role", hangout.id);
    if (ev) p = (p & ~BigInt(ev.deny)) | BigInt(ev.allow);
    let rd = 0n, ra = 0n;
    for (const id of member.roleIds) {
      if (id === hangout.id) continue;
      const o = find("role", id);
      if (o) { rd |= BigInt(o.deny); ra |= BigInt(o.allow); }
    }
    p = (p & ~rd) | ra; // role allow beats role deny
    const mo = find("member", member.userId);
    if (mo) p = (p & ~BigInt(mo.deny)) | BigInt(mo.allow);
  }
  if ((member.timeoutUntil ?? 0) > now) p &= READ_ONLY; // 6. timeout
  if (((member.flags ?? 0) & FLAG_PENDING) !== 0) p &= READ_ONLY; // 7. pending
  if (room) {
    // 9. implicit rules
    if ((p & BIT.VIEW_ROOM) === 0n) return 0n;
    if ((p & BIT.SEND_MESSAGES) === 0n) p &= ~NEEDS_SEND;
    if ((room.type === "lounge" || room.type === "spotlight") && (p & BIT.CONNECT) === 0n) p &= ~VOICE_BITS;
  }
  return p & ALL_BITS;
}
