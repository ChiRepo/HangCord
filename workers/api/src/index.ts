import { withConfigGate } from "@hangcord/worker-kit";
import { REQUIRED_SECRETS, makeApp, withNativeCors, type Env } from "./app";
import { googleKeySource } from "./auth/firebase";

export { UserDO } from "./user-do";
export type { Env };

export { REQUIRED_SECRETS };

const app = makeApp({ keys: googleKeySource() });

export default {
  fetch: withNativeCors(withConfigGate<Env>("api", REQUIRED_SECRETS, app)),
} satisfies ExportedHandler<Env>;
