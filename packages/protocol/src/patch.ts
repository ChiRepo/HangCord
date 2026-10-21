// Small, safe patch format used by HANGOUT_UPDATE and PREFERENCES_UPDATE (MASTER_PLAN §7.1).
import { z } from "zod";

const segment = z.union([z.string().min(1), z.number().int().min(0)]);

export const PatchOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.array(segment).min(1), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.array(segment).min(1) }),
]);
export type PatchOp = z.infer<typeof PatchOp>;
