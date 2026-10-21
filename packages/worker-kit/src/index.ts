import { CURRENT_PHASE, PROTOCOL_VERSION, type Health } from "@hangcord/protocol";

export type ServiceName = Health["service"];

/**
 * Fail closed (AGENTS.md §5): a Worker with a missing secret refuses every request.
 * The client only ever sees `not_configured` — never which secret is missing (docs/SECRETS_AND_SENSITIVE_DATA.md).
 * The owner-only Workers log gets the names so the owner can run `wrangler secret put`.
 */
export function missingSecrets(env: Record<string, unknown>, required: readonly string[]): string[] {
  return required.filter((name) => {
    const v = env[name];
    return typeof v !== "string" || v.trim().length === 0;
  });
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", headers.get("cache-control") ?? "no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export const errorResponse = (status: number, error: string) => json({ error }, { status });

export function health(service: ServiceName): Health {
  return { ok: true, service, version: PROTOCOL_VERSION, phase: CURRENT_PHASE };
}

/** Wrap a Worker's fetch with the config gate and a uniform 404/500. */
export function withConfigGate<E extends Record<string, unknown>>(
  service: ServiceName,
  required: readonly string[],
  handler: (req: Request, env: E, url: URL) => Promise<Response | null> | Response | null,
) {
  return async (req: Request, env: E): Promise<Response> => {
    const missing = missingSecrets(env, required);
    if (missing.length > 0) {
      console.error(`[${service}] refusing requests: ${missing.length} required secret(s) not set: ${missing.join(", ")}`);
      return errorResponse(503, "not_configured");
    }
    try {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/v1/health") return json(health(service));
      return (await handler(req, env, url)) ?? errorResponse(404, "not_found");
    } catch {
      // Never echo request bodies, headers or error details (MASTER_PLAN §12).
      console.error(`[${service}] unhandled error`);
      return errorResponse(500, "internal");
    }
  };
}
