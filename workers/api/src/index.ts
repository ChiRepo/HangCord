import { withConfigGate } from "@hangcord/worker-kit";

/**
 * Secrets this Worker refuses to run without, by phase. Phase 0 (cp-001) needs only the session
 * signing key; later phases add their own (full list: docs/SECRETS_AND_SENSITIVE_DATA.md).
 */
export const REQUIRED_SECRETS = ["SESSION_SIGNING_KEY"] as const;

export interface Env extends Record<string, unknown> {
  SESSION_SIGNING_KEY?: string;
}

export default {
  fetch: withConfigGate<Env>("api", REQUIRED_SECRETS, () => null),
} satisfies ExportedHandler<Env>;
