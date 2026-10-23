// D1 reads that build the shapes in packages/protocol (Room, HangoutSnapshot …) and the inputs of
// computePermissions(). Access checks fail closed: any D1 error propagates to the generic error boundary; no stale access fallback is used.
import {
  computePermissions, Room, RoomSettings, type HangoutSnapshot, type Override, type PermHangout, type PermMember, type PermRoom,
} from "@hangcord/protocol";

/** Lowercase ids that fit the cache-key rules (protocol `Id`): 16 chars of a-z2-7. */
export function newId(): string {
  const a = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => a[b & 31]).join("");
}

interface HangoutRow { id: string; owner_id: string; name: string; icon: string | null; version: number; perm_version: number; deleted_at: number | null; verification_level: number; settings_json: string }
interface RoleRow { id: string; name: string; color: string | null; position: number; permissions: string }
interface MemberRow { user_id: string; nickname: string | null; roles_json: string; timeout_until: number | null; flags: number; joined_at: number; email_verified: number; created_at: number; adult_confirmed: number }
interface RoomRow { id: string; hangout_id: string; type: Room["type"]; category_id: string | null; position: number; name: string; topic: string | null; settings_json: string; sync_with_category: number }
interface OverrideRow { room_id: string; target_type: "role" | "member"; target_id: string; allow: string; deny: string }

export interface HangoutState {
  hangout: HangoutRow;
  roles: RoleRow[];
  rooms: Room[];
  member: PermMember & { nickname: string | null };
  perm: PermHangout;
  permRooms: Map<string, PermRoom>;
}

/** Everything needed to answer for `uid` in `hangoutId`; null when it doesn't exist or uid isn't a member. */
export async function loadHangout(db: D1Database, hangoutId: string, uid: string): Promise<HangoutState | null> {
  const [h, roles, member, rooms, overrides] = await db.batch([
    db.prepare("SELECT id, owner_id, name, icon, version, perm_version, deleted_at, verification_level, settings_json FROM hangouts WHERE id = ?").bind(hangoutId),
    db.prepare("SELECT id, name, color, position, permissions FROM roles WHERE hangout_id = ? ORDER BY position, id").bind(hangoutId),
    db.prepare("SELECT m.user_id, m.nickname, m.roles_json, m.timeout_until, m.flags, m.joined_at, u.email_verified, u.created_at, u.adult_confirmed FROM members m JOIN users u ON u.id = m.user_id WHERE m.hangout_id = ? AND m.user_id = ?").bind(hangoutId, uid),
    db.prepare("SELECT id, hangout_id, type, category_id, position, name, topic, settings_json, sync_with_category FROM rooms WHERE hangout_id = ? ORDER BY CASE WHEN type = 'category' THEN 0 ELSE 1 END, position, id").bind(hangoutId),
    db.prepare("SELECT o.room_id, o.target_type, o.target_id, o.allow, o.deny FROM overrides o JOIN rooms r ON r.id = o.room_id WHERE r.hangout_id = ?").bind(hangoutId),
  ]);
  const hangout = (h!.results as HangoutRow[])[0];
  const m = (member!.results as MemberRow[])[0];
  if (!hangout || hangout.deleted_at !== null || !m) return null;

  const byRoom = new Map<string, Override[]>();
  for (const o of overrides!.results as OverrideRow[]) {
    const list = byRoom.get(o.room_id) ?? [];
    list.push({ targetType: o.target_type, targetId: o.target_id, allow: o.allow, deny: o.deny });
    byRoom.set(o.room_id, list);
  }
  const roomList: Room[] = (rooms!.results as RoomRow[]).map((r) => toRoom(r, byRoom.get(r.id) ?? []));
  const roleRows = roles!.results as RoleRow[];
  const roleIds: unknown = JSON.parse(m.roles_json);
  if (!Array.isArray(roleIds) || !roleIds.every((id): id is string => typeof id === "string")) throw new Error("invalid_access_data");
  const settings: unknown = JSON.parse(hangout.settings_json);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("invalid_access_data");
  const invitesPausedUntil = (settings as Record<string, unknown>).invitesPausedUntil;
  if (invitesPausedUntil !== undefined && (typeof invitesPausedUntil !== "number" || !Number.isSafeInteger(invitesPausedUntil))) throw new Error("invalid_access_data");
  // A synced child reads the category template live; the stored initial copy is not authoritative.
  for (const r of roomList) {
    if (!r.syncWithCategory) continue;
    const category = roomList.find((c) => c.id === r.categoryId && c.type === "category");
    if (!category) continue; // computePermissions denies the broken reference
    r.overrides = category.overrides;
    r.settings = { ...Object.fromEntries(Object.entries(r.settings ?? {}).filter(([key]) => !["slowmode", "ageRestricted", "translateDefault", "notifyDefault"].includes(key))), ...category.roomDefaults };
    r.guidelinesText = category.guidelinesText;
  }
  return {
    hangout,
    roles: roleRows,
    rooms: roomList,
    member: { userId: m.user_id, roleIds, timeoutUntil: m.timeout_until, flags: m.flags, nickname: m.nickname, joinedAt: m.joined_at, accountCreatedAt: m.created_at, emailVerified: m.email_verified === 1, adultConfirmed: m.adult_confirmed === 1 },
    perm: { id: hangout.id, ownerId: hangout.owner_id, verificationLevel: hangout.verification_level as PermHangout["verificationLevel"], invitesPausedUntil: invitesPausedUntil as number | undefined, roles: roleRows.map((r) => ({ id: r.id, position: r.position, permissions: BigInt(r.permissions) })) },
    permRooms: new Map(roomList.map((r) => [r.id, { id: r.id, type: r.type, categoryId: r.categoryId ?? null, syncWithCategory: r.syncWithCategory, overrides: r.overrides, ageRestricted: r.settings?.ageRestricted === true, hasSchedule: r.settings?.schedule !== undefined }])),
  };
}

function toRoom(r: RoomRow, overrides: Override[]): Room {
  const settings: unknown = JSON.parse(r.settings_json);
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("invalid_access_data");
  const { roomDefaults, guidelinesText, ...rest } = settings as { roomDefaults?: Room["roomDefaults"]; guidelinesText?: string } & Record<string, unknown>;
  // Schedule evaluation is a later slice; a configured schedule stays closed until evaluated.
  const { schedule, ...knownSettings } = rest;
  RoomSettings.parse(knownSettings);
  if (schedule !== undefined) rest.schedule = schedule;
  return Room.parse({
    id: r.id, hangoutId: r.hangout_id, type: r.type, categoryId: r.category_id, position: r.position, name: r.name,
    ...(r.topic !== null ? { topic: r.topic } : {}),
    syncWithCategory: r.sync_with_category === 1, overrides, settings: rest,
    ...(roomDefaults ? { roomDefaults } : {}),
    ...(guidelinesText !== undefined ? { guidelinesText } : {}),
  });
}

export const bitsFor = (s: HangoutState, roomId?: string, now = Date.now()) =>
  roomId !== undefined && !s.permRooms.has(roomId) ? 0n : computePermissions({ hangout: s.perm, member: s.member, room: roomId ? s.permRooms.get(roomId) : undefined, rooms: s.permRooms, now });

/** Rooms you can't VIEW are left out of your snapshot entirely. */
export function buildSnapshot(s: HangoutState, now = Date.now()): HangoutSnapshot {
  const myPermissions: Record<string, string> = {};
  const visible: Room[] = [];
  for (const room of s.rooms) {
    const bits = bitsFor(s, room.id, now);
    if (bits === 0n) continue;
    myPermissions[room.id] = bits.toString();
    visible.push(room);
  }
  return {
    hangoutId: s.hangout.id,
    version: s.hangout.version,
    permVersion: s.hangout.perm_version,
    hangout: { id: s.hangout.id, name: s.hangout.name, icon: s.hangout.icon },
    rooms: visible,
    roles: s.roles.map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position })),
    me: { userId: s.member.userId, nickname: s.member.nickname, roles: s.member.roleIds },
    myPermissions,
  };
}
