// Public gateway entry: room-scoped sockets and REST fallback/history.
// Identity headers are always replaced before entering RoomDO; only IDENTIFY carries a socket token.
import { errorResponse, withConfigGate } from "@hangcord/worker-kit";
import { verifySession } from "@hangcord/server";
import type { UserDO } from "../../api/src/user-do";
import type { RoomDO } from "./room-do";
import type { HangoutDO } from "./hangout-do";

export { RoomDO } from "./room-do";
export { HangoutDO } from "./hangout-do";
export const REQUIRED_SECRETS = ["SESSION_SIGNING_KEY", "HANGCORD_KEK_V1"] as const;
export interface Env extends Record<string, unknown> {
  SESSION_SIGNING_KEY?: string;
  HANGCORD_KEK_V1?: string;
  DB: D1Database;
  USERS: DurableObjectNamespace<UserDO>;
  ROOMS: DurableObjectNamespace<RoomDO>;
  HANGOUTS: DurableObjectNamespace<HangoutDO>;
}
const ID = /^[a-z0-9_-]{1,64}$/;
export async function route(req: Request, env: Env, url: URL): Promise<Response | null> {
  const socket = url.pathname === "/v1/gateway";
  const match = /^\/v1\/rooms\/([a-z0-9_-]{1,64})\/messages$/.exec(url.pathname);
  if (!socket && !match) return null;
  if (socket && req.method !== "GET" || !socket && req.method !== "GET" && req.method !== "POST") return errorResponse(405, "method_not_allowed");
  if (socket && req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorResponse(426, "upgrade_required");
  const roomId = socket ? url.searchParams.get("room") ?? "" : match![1]!;
  if (!ID.test(roomId) || socket && (Array.from(url.searchParams.keys()).some((k) => k !== "room") || url.searchParams.getAll("room").length !== 1)) return errorResponse(400, "bad_room");
  const headers = new Headers(req.headers);
  for (const key of ["x-room-id", "x-hangout-id", "x-uid", "x-sid", "x-exp"]) headers.delete(key);
  if (!socket) {
    const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const claims = token ? await verifySession(env.SESSION_SIGNING_KEY!, token) : null;
    if (!claims || !await env.USERS.get(env.USERS.idFromName(claims.uid)).isActive(claims.sid, Date.now())) return errorResponse(401, "unauthorized");
    headers.set("x-uid", claims.uid); headers.set("x-sid", claims.sid); headers.set("x-exp", String(claims.exp));
  }
  const room = await env.DB.prepare("SELECT r.hangout_id FROM rooms r JOIN hangouts h ON h.id = r.hangout_id WHERE r.id = ? AND r.type != 'category' AND h.deleted_at IS NULL").bind(roomId).first<{ hangout_id: string }>();
  if (!room) return errorResponse(404, "not_found");
  headers.set("x-room-id", roomId); headers.set("x-hangout-id", room.hangout_id);
  return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request(req, { headers }));
}
export default { fetch: withConfigGate<Env>("gateway", REQUIRED_SECRETS, route) } satisfies ExportedHandler<Env>;
