import { missingSecrets, withConfigGate } from "@hangcord/worker-kit";
import { jobsDue } from "./jobs";

export const REQUIRED_SECRETS = ["CSV_ROUTINE_KEY", "CSV_EMERGENCY_PUBLIC_KEY_V1"] as const;

export interface Env extends Record<string, unknown> {
  CSV_ROUTINE_KEY?: string;
  CSV_EMERGENCY_PUBLIC_KEY_V1?: string;
}

export default {
  fetch: withConfigGate<Env>("storage-router", REQUIRED_SECRETS, () => null),
  async scheduled(controller, env) {
    if (missingSecrets(env, REQUIRED_SECRETS).length > 0) {
      console.error("[storage-router] scheduled run skipped: not configured");
      return;
    }
    const due = jobsDue(new Date(controller.scheduledTime));
    console.warn(`[storage-router] tick: ${due.join(", ")} (phase 0: no-op)`);
  },
} satisfies ExportedHandler<Env>;
