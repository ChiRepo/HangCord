// Permission bits (ACCESS_AND_SETTINGS §3). test/permissions.test.ts keeps this identical to the
// table in the docs. Bits are an unsigned 64-bit field sent as a decimal string; unassigned bits
// must be zero.

/** [bit, name, scope]: "R" = settable per room, "H" = hangout-wide only, "H/R" = both. */
export const PERMISSIONS = [
  [0, "VIEW_ROOM", "R"], [1, "READ_HISTORY", "R"], [2, "SEND_MESSAGES", "R"], [3, "SEND_IN_STRANDS", "R"],
  [4, "CREATE_PUBLIC_STRANDS", "R"], [5, "CREATE_PRIVATE_STRANDS", "R"], [6, "EMBED_LINKS", "R"], [7, "ATTACH_FILES", "R"],
  [8, "ADD_REACTIONS", "R"], [9, "USE_EXTERNAL_EXPRESSIONS", "R"], [10, "MENTION_EVERYONE", "R"], [11, "SEND_VOICE_MESSAGES", "R"],
  [12, "SEND_POLLS", "R"], [13, "USE_COMMANDS", "R"], [14, "SCHEDULE_MESSAGES", "R"], [15, "BYPASS_SLOWMODE", "R"],
  [16, "PIN_MESSAGES", "R"], [17, "MANAGE_MESSAGES", "R"], [18, "MANAGE_STRANDS", "R"], [19, "CONNECT", "R"],
  [20, "SPEAK", "R"], [21, "CAMERA", "R"], [22, "SHARE_SCREEN", "R"], [23, "USE_VOICE_ACTIVITY", "R"],
  [24, "PRIORITY_SPEAKER", "R"], [25, "USE_SOUNDBOARD", "R"], [26, "SET_LOUNGE_STATUS", "R"], [27, "REQUEST_TO_SPEAK", "R"],
  [28, "MUTE_MEMBERS", "R"], [29, "DEAFEN_MEMBERS", "R"], [30, "MOVE_MEMBERS", "R"], [31, "START_TOGETHER", "R"],
  [32, "CONTROL_TOGETHER", "R"], [33, "USE_WHITEBOARD", "R"], [34, "MANAGE_WHITEBOARD", "R"], [35, "USE_AI_CATCHUP", "R"],
  [36, "USE_TRANSLATION", "R"], [37, "CREATE_INVITES", "R"], [38, "MANAGE_ROOM_PERMISSIONS", "R"], [39, "MANAGE_WEBHOOKS", "R"],
  [40, "MANAGE_ROOMS", "H/R"], [41, "CREATE_EVENTS", "H/R"], [42, "MANAGE_EVENTS", "H/R"], [43, "CHANGE_NICKNAME", "H"],
  [44, "MANAGE_NICKNAMES", "H"], [45, "CREATE_EXPRESSIONS", "H"], [46, "MANAGE_EXPRESSIONS", "H"], [47, "TIMEOUT_MEMBERS", "H"],
  [48, "KICK_MEMBERS", "H"], [49, "BAN_MEMBERS", "H"], [50, "MANAGE_INVITES", "H"], [51, "VIEW_AUDIT_LOG", "H"],
  [52, "VIEW_INSIGHTS", "H"], [53, "VIEW_SAFETY_ALERTS", "H"], [54, "MANAGE_SECURITY_ACTIONS", "H"], [55, "MANAGE_AUTOMOD", "H"],
  [56, "MANAGE_ROLES", "H/R"], [57, "MANAGE_HANGOUT", "H"], [58, "VIEW_AS_ROLE", "H"], [59, "ADMINISTRATOR", "H"],
] as const;

export type PermissionName = (typeof PERMISSIONS)[number][1];

export const BIT = Object.fromEntries(PERMISSIONS.map(([b, n]) => [n, 1n << BigInt(b)])) as Record<PermissionName, bigint>;

/** Every assigned bit. */
export const KNOWN_BITS = PERMISSIONS.reduce((m, [b]) => m | (1n << BigInt(b)), 0n);
/** Bits that may appear in a room/category override. */
export const ROOM_SCOPED_BITS = PERMISSIONS.reduce((m, [b, , s]) => (s === "H" ? m : m | (1n << BigInt(b))), 0n);

const U64_MAX = (1n << 64n) - 1n;

/** Parse a decimal-string bitfield; null if malformed, > u64, or has unassigned bits. */
export function parseBits(s: string): bigint | null {
  if (!/^\d{1,20}$/.test(s)) return null;
  const v = BigInt(s);
  if (v > U64_MAX || (v & ~KNOWN_BITS) !== 0n) return null;
  return v;
}

export const has = (bits: bigint, perm: PermissionName) => (bits & BIT[perm]) === BIT[perm];
