// "+" on a category → new Room/Lounge (ACCESS_AND_SETTINGS §7.1). Shared by the API Worker
// (authoritative) and the apps (optimistic UI), so both always agree. Pure: the route does auth,
// computePermissions(), the D1 write and the ROOM_CREATE broadcast.
import { RoomSettings, type CreateRoomRequest, type Override, type Room } from "./schemas";
import { parseBits, ROOM_SCOPED_BITS } from "./permissions";

export const MAX_ROOMS_PER_CATEGORY = 50;
export const MAX_ROOMS_PER_HANGOUT = 500;

export type NewRoomError =
  | "forbidden" // no MANAGE_ROOMS on the category
  | "needs_manage_room_permissions" // custom overrides without MANAGE_ROOM_PERMISSIONS
  | "grants_exceed_creator" // own guidelines would open a bit the creator doesn't hold
  | "bad_bits" // malformed, > u64, unassigned or hangout-only bits in an override
  | "category_full"
  | "hangout_full"
  | "not_a_category"
  | "nested_category"
  | "bad_name"
  | "bad_settings"; // unknown setting or out of range

/** HTTP status for each error (openapi.yaml createRoom). */
export const NEW_ROOM_ERROR_STATUS: Record<NewRoomError, 400 | 403 | 409> = {
  forbidden: 403, needs_manage_room_permissions: 403, grants_exceed_creator: 403,
  bad_bits: 400, not_a_category: 400, nested_category: 400, bad_name: 400, bad_settings: 400,
  category_full: 409, hangout_full: 409,
};

const key = (o: Pick<Override, "targetType" | "targetId">) => `${o.targetType}:${o.targetId}`;

/**
 * Bits a change would OPEN for a target: newly allowed, or no longer denied. Own guidelines start
 * as an exact copy of the category, so every opened bit must be one the creator holds.
 */
function openedBits(before: Override[], after: Override[]): { opened: bigint; changed: boolean } | null {
  const b = new Map(before.map((o) => [key(o), o]));
  const a = new Map(after.map((o) => [key(o), o]));
  if (a.size !== after.length) return null; // duplicate targets
  let opened = 0n;
  let changed = false;
  for (const k of new Set([...b.keys(), ...a.keys()])) {
    const ob = b.get(k);
    const oa = a.get(k);
    const [ba, bd] = [ob ? parseBits(ob.allow) : 0n, ob ? parseBits(ob.deny) : 0n];
    const [aa, ad] = [oa ? parseBits(oa.allow) : 0n, oa ? parseBits(oa.deny) : 0n];
    if (ba === null || bd === null || aa === null || ad === null) return null;
    if (((aa | ad) & ~ROOM_SCOPED_BITS) !== 0n || (aa & ad) !== 0n) return null;
    if (aa !== ba || ad !== bd) changed = true;
    opened |= (aa & ~ba) | (bd & ~ad);
  }
  return { opened, changed };
}

export function planNewRoom(args: {
  req: CreateRoomRequest;
  hangoutId: string;
  newId: string;
  /** computePermissions(creator, category) includes MANAGE_ROOMS. */
  canManageRooms: boolean;
  /** …includes MANAGE_ROOM_PERMISSIONS (needed to change overrides). */
  canManageRoomPermissions: boolean;
  /** Creator's effective bits in this category. */
  creatorBits: bigint;
  category: Room | null;
  roomsInCategory: number;
  roomsInHangout: number;
}): { ok: true; room: Room } | { ok: false; error: NewRoomError } {
  const { req, category } = args;
  if (!args.canManageRooms) return { ok: false, error: "forbidden" };
  if (req.type === "category") return { ok: false, error: "nested_category" };
  if ((req.categoryId ?? null) !== (category?.id ?? null) || (category && category.type !== "category")) {
    return { ok: false, error: "not_a_category" };
  }
  const name = req.type === "text" ? slugRoomName(req.name) : req.name.trim().replace(/\s+/g, " ");
  if (name.length === 0 || name.length > 100) return { ok: false, error: "bad_name" };
  if (req.settings !== undefined && !RoomSettings.safeParse(req.settings).success) return { ok: false, error: "bad_settings" };
  if (args.roomsInHangout >= MAX_ROOMS_PER_HANGOUT) return { ok: false, error: "hangout_full" };
  if (category && args.roomsInCategory >= MAX_ROOMS_PER_CATEGORY) return { ok: false, error: "category_full" };

  const inherited: Override[] = category ? category.overrides.map((o) => ({ ...o })) : [];
  const followsCategory = req.guidelines === "category" && category !== null;
  let overrides = inherited;
  let settings: Record<string, unknown> = { ...(category?.roomDefaults ?? {}) };

  if (!followsCategory) {
    if (req.overrides) {
      const diff = openedBits(inherited, req.overrides);
      if (!diff) return { ok: false, error: "bad_bits" };
      if (diff.changed && !args.canManageRoomPermissions) return { ok: false, error: "needs_manage_room_permissions" };
      if ((diff.opened & ~args.creatorBits) !== 0n) return { ok: false, error: "grants_exceed_creator" };
      overrides = req.overrides.map((o) => ({ ...o }));
    }
    settings = { ...settings, ...(req.settings ?? {}) };
  }

  return {
    ok: true,
    room: {
      id: args.newId,
      hangoutId: args.hangoutId,
      type: req.type,
      categoryId: category?.id ?? null,
      position: category ? args.roomsInCategory : args.roomsInHangout,
      name,
      syncWithCategory: followsCategory,
      overrides,
      settings,
      ...(category?.guidelinesText !== undefined ? { guidelinesText: category.guidelinesText } : {}),
    },
  };
}

/** Text rooms are lowercase-with-dashes (ACCESS_AND_SETTINGS §7). */
export function slugRoomName(name: string): string {
  return liveSlug(name).replace(/^-+|-+$/g, "").slice(0, 100);
}

/** As-you-type version: same rules but keeps a trailing dash so typing feels natural. */
export function liveSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{M}\p{N}_-]/gu, "").replace(/-+/g, "-").replace(/^-+/, "");
}
