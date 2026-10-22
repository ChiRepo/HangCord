// D1 reads that build the shapes in packages/protocol (Room, HangoutSnapshot …) and the inputs of
// computePermissions(). Access checks fail closed: any D1 error propagates as a 503 from the app.
import {
  computePermissions, type HangoutSnapshot, type Override, type PermHangout, type PermMember, type PermRoom, type Room,
} from "@hangcord/protocol";

/** Lowercase ids that fit the cache-key rules (protocol `Id`): 16 chars of a-z2-7. */
export function newId(): string {
  const a = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => a[b & 31]).join("");
}

interface HangoutRow { id: string; owner_id: string; name: string; icon: string | null; version: number; perm_version: number; deleted_at: number | null }
interface RoleRow { id: string; name: string; color: string | null; position: number; permissions: string }
interface MemberRow { user_id: string; nickname: string | null; roles_json: string; timeout_until: number | null; flags: number }
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
    db.prepare("SELECT id, owner_id, name, icon, version, perm_version, deleted_at FROM hangouts WHERE id = ?").bind(hangoutId),
    db.prepare("SELECT id, name, color, position, permissions FROM roles WHERE hangout_id = ? ORDER BY position, id").bind(hangoutId),
    db.prepare("SELECT user_id, nickname, roles_json, timeout_until, flags FROM members WHERE hangout_id = ? AND user_id = ?").bind(hangoutId, uid),
    db.prepare("SELECT id, hangout_id, type, category_id, position, name, topic, settings_json, sync_with_category FROM rooms WHERE hangout_id = ? ORDER BY position, id").bind(hangoutId),
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
  const roleIds = (JSON.parse(m.roles_json) as string[]).filter((id) => roleRows.some((r) => r.id === id));
  return {
    hangout,
    roles: roleRows,
    rooms: roomList,
    member: { userId: m.user_id, roleIds, timeoutUntil: m.timeout_until, flags: m.flags, nickname: m.nickname },
    perm: { id: hangout.id, ownerId: hangout.owner_id, roles: roleRows.map((r) => ({ id: r.id, position: r.position, permissions: BigInt(r.permissions) })) },
    permRooms: new Map(roomList.map((r) => [r.id, { id: r.id, type: r.type, categoryId: r.categoryId ?? null, syncWithCategory: r.syncWithCategory, overrides: r.overrides }])),
  };
}

function toRoom(r: RoomRow, overrides: Override[]): Room {
  const settings = JSON.parse(r.settings_json) as Record<string, unknown>;
  const { roomDefaults, guidelinesText, ...rest } = settings as { roomDefaults?: Room["roomDefaults"]; guidelinesText?: string } & Record<string, unknown>;
  return {
    id: r.id, hangoutId: r.hangout_id, type: r.type, categoryId: r.category_id, position: r.position, name: r.name,
    ...(r.topic !== null ? { topic: r.topic } : {}),
    syncWithCategory: r.sync_with_category === 1, overrides, settings: rest,
    ...(roomDefaults ? { roomDefaults } : {}),
    ...(guidelinesText !== undefined ? { guidelinesText } : {}),
  };
}

export const bitsFor = (s: HangoutState, roomId?: string, now = Date.now()) =>
  computePermissions({ hangout: s.perm, member: s.member, room: roomId ? s.permRooms.get(roomId) : undefined, rooms: s.permRooms, now });

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
