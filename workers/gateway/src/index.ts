import { errorResponse, withConfigGate } from "@hangcord/worker-kit";
import { helloFrame, onFrame } from "./session";

export const REQUIRED_SECRETS = ["SESSION_SIGNING_KEY", "HANGCORD_KEK_V1"] as const;

export interface Env extends Record<string, unknown> {
  SESSION_SIGNING_KEY?: string;
  HANGCORD_KEK_V1?: string;
}

export default {
  fetch: withConfigGate<Env>("gateway", REQUIRED_SECRETS, (req, _env, url) => {
    if (url.pathname !== "/v1/gateway") return null;
    if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return errorResponse(426, "upgrade_required");
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    server.send(JSON.stringify(helloFrame()));
    server.addEventListener("message", (ev) => {
      const result = onFrame(typeof ev.data === "string" ? ev.data : "");
      for (const frame of result.reply) server.send(JSON.stringify(frame));
      if (result.close) server.close(result.close.code, result.close.reason);
    });
    return new Response(null, { status: 101, webSocket: client });
  }),
} satisfies ExportedHandler<Env>;
