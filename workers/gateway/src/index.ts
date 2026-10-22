// Gateway Worker (MASTER_PLAN §6): WebSocket per open hangout → its HangoutDO, plus the REST message
// routes (history + fallback send) that need the same Durable Object.
import { errorResponse, withConfigGate } from "@hangcord/worker-kit";
import { verifySession } from "@hangcord/server";
import type { HangoutDO } from "./hangout-do";

export { HangoutDO } from "./hangout-do";

export const REQUIRED_SECRETS = ["SESSION_SIGNING_KEY", "HANGCORD_KEK_V1"] as const;

export interface Env extends Record<string, unknown> {
  SESSION_SIGNING_KEY?: string;
  HANGCORD_KEK_V1?: string;
  DB: D1Database;
  HANGOUTS: DurableObjectNamespace<HangoutDO>;
}

const ID = /^[a-z0-9_-]{1,64}$/;
const forward = (env: Env, hangoutId: string, req: Request, extra: Record<string, string> = {}) => {
  const headers = new Headers(req.headers);
  // Internal headers are set here only; anything a client sent under these names is replaced.
  for (const h of ["x-hangout-id", "x-uid", "x-room-id"]) headers.delete(h);
  headers.set("x-hangout-id", hangoutId);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return env.HANGOUTS.get(env.HANGOUTS.idFromName(hangoutId)).fetch(new Request(req, { headers }));
};

export async function route(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname === "/v1/gateway") {
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorResponse(426, "upgrade_required");
    const hangoutId = url.searchParams.get("hangout") ?? "";
    if (!ID.test(hangoutId)) return errorResponse(400, "bad_hangout");
    return forward(env, hangoutId, req); // IDENTIFY inside the socket authenticates
  }
  const m = /^\/v1\/rooms\/([a-z0-9_-]{1,64})\/messages$/.exec(url.pathname);
  if (m) {
    if (req.method !== "GET" && req.method !== "POST") return errorResponse(405, "method_not_allowed");
    const token = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const claims = token ? await verifySession(env.SESSION_SIGNING_KEY!, token) : null;
    if (!claims) return errorResponse(401, "unauthorized");
    if (req.method === "POST" && !(req.headers.get("content-type") ?? "").startsWith("application/json")) return errorResponse(415, "json_required");
    const room = await env.DB.prepare("SELECT hangout_id FROM rooms WHERE id = ?").bind(m[1]).first<{ hangout_id: string }>();
    if (!room) return errorResponse(404, "not_found");
    return forward(env, room.hangout_id, req, { "x-uid": claims.uid, "x-room-id": m[1]! });
  }
  return null;
}

export default {
  fetch: withConfigGate<Env>("gateway", REQUIRED_SECRETS, route),
} satisfies ExportedHandler<Env>;
