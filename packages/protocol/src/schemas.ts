// Zod mirrors of the "detailed" schemas in openapi.yaml. Keep the two in sync —
// test/contract.test.ts fails if a detailed schema is missing here.
import { z } from "zod";
import { parseBits } from "./permissions";

export const ErrorBody = z.object({ error: z.string(), message: z.string().optional() });
export type ErrorBody = z.infer<typeof ErrorBody>;

export const Health = z.object({
  ok: z.boolean(),
  service: z.enum(["api", "gateway", "storage-router"]),
  version: z.string(),
  phase: z.number().int(),
});
export type Health = z.infer<typeof Health>;

export const RoomType = z.enum(["text", "lounge", "spotlight", "board", "bulletin", "category"]);
export type RoomType = z.infer<typeof RoomType>;

/** How a new room relates to its category (ACCESS_AND_SETTINGS §7.1). */
export const GuidelinesChoice = z.enum(["category", "own"]);
export type GuidelinesChoice = z.infer<typeof GuidelinesChoice>;

/** User preference `rooms.newRoomGuidelines` — only pre-selects the choice. */
export const NewRoomGuidelinesPreference = z.enum(["category", "own", "ask"]);
export type NewRoomGuidelinesPreference = z.infer<typeof NewRoomGuidelinesPreference>;

const bitfield = z.string().refine((s) => parseBits(s) !== null, "permission bitfield: decimal u64 string with only assigned bits");

export const Override = z.object({
  targetType: z.enum(["role", "member"]),
  targetId: z.string(),
  allow: bitfield,
  deny: bitfield,
});
export type Override = z.infer<typeof Override>;

export const RoomDefaults = z.object({
  slowmode: z.number().int().min(0).max(21600).optional(),
  ageRestricted: z.boolean().optional(),
  translateDefault: z.boolean().optional(),
  notifyDefault: z.enum(["all", "mentions", "nothing"]).optional(),
});
export type RoomDefaults = z.infer<typeof RoomDefaults>;

export const Room = z.object({
  id: z.string(),
  hangoutId: z.string(),
  type: RoomType,
  categoryId: z.string().nullable().optional(),
  position: z.number().int(),
  name: z.string().min(1).max(100),
  topic: z.string().max(4096).optional(),
  syncWithCategory: z.boolean(),
  overrides: z.array(Override),
  settings: z.record(z.string(), z.unknown()).optional(),
  roomDefaults: RoomDefaults.optional(),
  guidelinesText: z.string().max(2000).optional(),
}).refine((r) => r.type === "board" || (r.topic?.length ?? 0) <= 1024, { message: "topic ≤ 1024 (Boards ≤ 4096)", path: ["topic"] });
export type Room = z.infer<typeof Room>;

/** Allowed room settings and their ranges (ACCESS_AND_SETTINGS §7). Unknown keys are rejected. */
export const RoomSettings = z.object({
  slowmode: z.number().int().min(0).max(21600),
  ageRestricted: z.boolean(),
  translateDefault: z.boolean(),
  notifyDefault: z.enum(["all", "mentions", "nothing"]),
  strandAutoArchive: z.enum(["1h", "1d", "3d", "1w"]),
  userLimit: z.number().int().min(0).max(99),
  bitrate: z.number().int().min(32).max(128),
  videoQuality: z.enum(["auto", "full"]),
  togetherAllowed: z.boolean(),
  whiteboardAllowed: z.boolean(),
  status: z.string().max(100),
}).partial().strict();
export type RoomSettings = z.infer<typeof RoomSettings>;

export const CreateRoomRequest = z.object({
  type: RoomType,
  name: z.string().min(1).max(100),
  categoryId: z.string().nullable().optional(),
  guidelines: GuidelinesChoice,
  overrides: z.array(Override).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type CreateRoomRequest = z.infer<typeof CreateRoomRequest>;

export const PrefEntry = z.object({ value: z.unknown(), updatedAt: z.number().int() });
export type PrefEntry = z.infer<typeof PrefEntry>;

export const Preferences = z.object({
  version: z.number().int().min(0),
  values: z.record(z.string(), PrefEntry),
});
export type Preferences = z.infer<typeof Preferences>;

export const PreferencesPatch = z.object({ set: z.record(z.string(), PrefEntry) });
export type PreferencesPatch = z.infer<typeof PreferencesPatch>;

/** Ids are cache-key safe on every platform (lowercase letters, digits, dash, underscore). */
export const Id = z.string().regex(/^[a-z0-9_-]{1,64}$/, "id: 1–64 of a-z 0-9 _ -");

export const HangoutSnapshot = z.object({
  hangoutId: Id,
  version: z.number().int(),
  permVersion: z.number().int(),
  hangout: z.object({ id: z.string(), name: z.string(), icon: z.string().nullable().optional() }),
  rooms: z.array(Room),
  roles: z.array(z.object({ id: z.string(), name: z.string(), color: z.string().nullable(), position: z.number().int() })),
  me: z.object({ userId: z.string(), nickname: z.string().nullable().optional(), roles: z.array(z.string()) }),
  /** roomId → bitfield. Cosmetic only; the server always re-checks. */
  myPermissions: z.record(z.string(), bitfield),
  emoji: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type HangoutSnapshot = z.infer<typeof HangoutSnapshot>;


// ---- Sessions (MASTER_PLAN §6.1) — detailed since cp-002 ----
export const SessionRequest = z.object({ idToken: z.string().min(20).max(4096) }).strict();
export type SessionRequest = z.infer<typeof SessionRequest>;

// Desktop sign-in keeps all Firebase configuration and provider tokens in the API Worker.
export const PasswordSignInRequest = z.object({ email: z.email().max(254), password: z.string().min(1).max(4096) }).strict();
export type PasswordSignInRequest = z.infer<typeof PasswordSignInRequest>;
export const GoogleExchangeRequest = z.object({
  code: z.string().min(1).max(4096),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  redirectUri: z.string().regex(/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/oauth\/callback$/).refine((value) => {
    try { const u = new URL(value); return Number(u.port) > 0 && Number(u.port) <= 65535; } catch { return false; }
  }),
  link: PasswordSignInRequest.optional(),
}).strict();
export type GoogleExchangeRequest = z.infer<typeof GoogleExchangeRequest>;
export const DesktopAuthConfig = z.object({ googleClientId: z.string().min(1).max(256) }).strict();
export type DesktopAuthConfig = z.infer<typeof DesktopAuthConfig>;

export const RefreshRequest = z.object({ refreshToken: z.string().min(20).max(1024) }).strict();
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export const User = z.object({
  id: z.string(),
  displayName: z.string().max(64),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable().optional(),
  createdAt: z.number().int(),
});
export type User = z.infer<typeof User>;

export const Session = z.object({
  session: z.string(),
  /** Unix ms when `session` stops working (15 min). */
  expiresAt: z.number().int(),
  refreshToken: z.string(),
  user: User,
});
export type Session = z.infer<typeof Session>;

// ---- Messages — detailed since cp-002.1 ----
export const MAX_MESSAGE_CHARS = 4000;
export const Message = z.object({
  id: Id,
  roomId: Id,
  hangoutId: Id,
  authorId: z.string(),
  content: z.string().max(MAX_MESSAGE_CHARS),
  createdAt: z.number().int(),
  editedAt: z.number().int().nullable(),
});
export type Message = z.infer<typeof Message>;

export const SendMessageRequest = z.object({
  content: z.string().max(MAX_MESSAGE_CHARS).refine((s) => s.trim().length > 0, "empty"),
  /** Client-chosen id so a retry never posts twice. */
  nonce: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
}).strict();
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const MessagesPage = z.object({ messages: z.array(Message), hasMore: z.boolean() });
export type MessagesPage = z.infer<typeof MessagesPage>;

// ---- Hangouts — detailed since cp-002 ----
export const CreateHangoutRequest = z.object({ name: z.string().trim().min(2).max(100) }).strict();
export type CreateHangoutRequest = z.infer<typeof CreateHangoutRequest>;

export const HangoutSummary = z.object({ id: Id, name: z.string(), icon: z.string().nullable().optional(), ownerId: z.string(), version: z.number().int() });
export type HangoutSummary = z.infer<typeof HangoutSummary>;

/** Names of the schemas above that openapi.yaml must also define. */
export const DETAILED_SCHEMAS = [
  "Error", "Health", "RoomType", "GuidelinesChoice", "NewRoomGuidelinesPreference", "Override",
  "RoomDefaults", "Room", "CreateRoomRequest", "Preferences", "PreferencesPatch", "HangoutSnapshot",
  "SessionRequest", "PasswordSignInRequest", "GoogleExchangeRequest", "DesktopAuthConfig", "RefreshRequest", "User", "Session", "CreateHangoutRequest", "HangoutSummary",
  "Message", "SendMessageRequest", "MessagesPage",
] as const;
