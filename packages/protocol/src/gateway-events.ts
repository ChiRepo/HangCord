// Canonical gateway (WSS) contract — MASTER_PLAN §6 + ACCESS_AND_SETTINGS §14.
// No op may be sent or handled unless it is listed in GatewayOp.
import { z } from "zod";
import { HangoutSnapshot, Message, Preferences, Room, SendMessageRequest } from "./schemas";
import { PatchOp } from "./patch";

export const GatewayOp = z.enum([
  "HELLO", "IDENTIFY", "READY", "HEARTBEAT", "HEARTBEAT_ACK", "RESUME",
  "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "MESSAGE_ACK",
  "REACTION_ADD", "REACTION_REMOVE", "TYPING_START", "PRESENCE_UPDATE", "READ_STATE",
  "VOICE_STATE", "TOGETHER_STATE", "BOARD_UPDATE", "NOTIFY", "MLS_COMMIT", "SYSTEM_NOTICE",
  // Access & settings (ACCESS_AND_SETTINGS §14)
  "ROLE_CREATE", "ROLE_UPDATE", "ROLE_DELETE", "MEMBER_UPDATE",
  "ROOM_CREATE", "ROOM_UPDATE", "ROOM_DELETE",
  "PERMISSIONS_UPDATE", "SECURITY_ACTION_UPDATE", "SAFETY_ALERT",
  // Caching (MASTER_PLAN §7.1)
  "HANGOUT_UPDATE", "PREFERENCES_UPDATE",
]);
export type GatewayOp = z.infer<typeof GatewayOp>;

/** Versions the client already has cached; sent in IDENTIFY. */
export const CacheVersions = z.object({
  prefsVersion: z.number().int().min(0),
  hangouts: z.record(z.string(), z.number().int().min(0)),
});
export type CacheVersions = z.infer<typeof CacheVersions>;

/** What READY says about each cached hangout. */
export const HangoutSync = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unchanged"), version: z.number().int() }),
  z.object({ kind: z.literal("patches"), fromVersion: z.number().int(), toVersion: z.number().int(), toPermVersion: z.number().int().optional(), patches: z.array(z.array(PatchOp)) }),
  z.object({ kind: z.literal("full"), snapshot: HangoutSnapshot }),
  z.object({ kind: z.literal("removed") }),
]);
export type HangoutSync = z.infer<typeof HangoutSync>;

export const Hello = z.object({ op: z.literal("HELLO"), d: z.object({ heartbeatIntervalMs: z.number().int().min(5000) }) });
export const Heartbeat = z.object({ op: z.literal("HEARTBEAT"), d: z.object({ seq: z.number().int().nullable() }) });
export const HeartbeatAck = z.object({ op: z.literal("HEARTBEAT_ACK"), d: z.object({}).strict() });
export const Identify = z.object({
  op: z.literal("IDENTIFY"),
  d: z.object({
    token: z.string().min(1),
    client: z.object({ platform: z.enum(["desktop", "web", "web-mobile"]), version: z.string() }),
    cache: CacheVersions,
  }),
});
export const Resume = z.object({ op: z.literal("RESUME"), d: z.object({ token: z.string().min(1), sessionId: z.string(), seq: z.number().int() }) });
export const Ready = z.object({
  op: z.literal("READY"),
  d: z.object({
    sessionId: z.string(),
    preferences: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("unchanged"), version: z.number().int() }),
      z.object({ kind: z.literal("full"), preferences: Preferences }),
    ]),
    hangouts: z.record(z.string(), HangoutSync),
  }),
});
export const HangoutUpdate = z.object({
  op: z.literal("HANGOUT_UPDATE"),
  d: z.object({ hangoutId: z.string(), version: z.number().int(), permVersion: z.number().int().optional(), patch: z.array(PatchOp) }),
});
export const PreferencesUpdate = z.object({
  op: z.literal("PREFERENCES_UPDATE"),
  d: z.object({ version: z.number().int(), set: Preferences.shape.values }),
});
export const RoomCreate = z.object({ op: z.literal("ROOM_CREATE"), d: z.object({ hangoutVersion: z.number().int(), room: Room }) });
/** Client → server: send in a room of the hangout this socket is identified for. */
export const MessageCreateRequest = z.object({ op: z.literal("MESSAGE_CREATE"), d: SendMessageRequest.extend({ roomId: z.string().min(1).max(64) }) });
/** Server → client: a new message (`nonce` only on the sender's own copy). */
export const MessageCreateEvent = z.object({ op: z.literal("MESSAGE_CREATE"), d: z.object({ message: Message, nonce: z.string().optional() }), s: z.number().int().optional() });
/** Server → sender: accepted (stored + broadcast) or refused with a short code. */
export const MessageAck = z.object({
  op: z.literal("MESSAGE_ACK"),
  d: z.union([z.object({ nonce: z.string(), ok: z.literal(true), messageId: z.string() }), z.object({ nonce: z.string(), ok: z.literal(false), error: z.string() })]),
});
export const SystemNotice = z.object({ op: z.literal("SYSTEM_NOTICE"), d: z.object({ code: z.string(), message: z.string() }) });

/** Frames with a detailed schema at cp-001. Others use the generic envelope until their phase. */
export const DetailedFrame = z.discriminatedUnion("op", [
  Hello, Heartbeat, HeartbeatAck, Identify, Resume, Ready, HangoutUpdate, PreferencesUpdate, RoomCreate, SystemNotice, MessageAck,
]);
export type DetailedFrame = z.infer<typeof DetailedFrame>;

export const Envelope = z.object({ op: GatewayOp, d: z.unknown(), s: z.number().int().optional() });

/** Parse any incoming frame: strict for detailed ops, envelope-only for the rest. */
export type ParsedFrame = { detailed: true; frame: DetailedFrame } | { detailed: false; frame: z.infer<typeof Envelope> };

const DETAILED_OPS = new Set<string>(DetailedFrame.options.map((o) => o.shape.op.value));

/** Parse any incoming frame: strict (and typed) for detailed ops, envelope-only for the rest. */
export function parseFrame(raw: unknown): ({ ok: true } & ParsedFrame) | { ok: false; error: string } {
  const env = Envelope.safeParse(raw);
  if (!env.success) return { ok: false, error: "bad_envelope" };
  if (DETAILED_OPS.has(env.data.op)) {
    const strict = DetailedFrame.safeParse(raw);
    if (!strict.success) return { ok: false, error: `bad_${env.data.op.toLowerCase()}` };
    return { ok: true, detailed: true, frame: strict.data };
  }
  return { ok: true, detailed: false, frame: env.data };
}

/** Ops a client may send. Everything else is server → client only (MASTER_PLAN §6). */
export const CLIENT_OPS = new Set<GatewayOp>([
  "IDENTIFY", "RESUME", "HEARTBEAT", "MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "REACTION_ADD", "REACTION_REMOVE",
  "TYPING_START", "PRESENCE_UPDATE", "READ_STATE", "VOICE_STATE", "TOGETHER_STATE", "BOARD_UPDATE", "MLS_COMMIT",
]);
