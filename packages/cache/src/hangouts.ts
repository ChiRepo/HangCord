import { HangoutSnapshot, type HangoutSync, type PatchOp } from "@hangcord/protocol";
import { applyPatch, PatchError } from "./patch";

export type ApplyResult =
  | { status: "applied"; snapshot: HangoutSnapshot }
  | { status: "stale-event" } // older or duplicate event: ignore
  | { status: "refetch" }; // gap or bad patch: GET /hangouts/:id/snapshot with If-None-Match

/** Apply a live HANGOUT_UPDATE to a cached snapshot (MASTER_PLAN §7.1 step 3). */
export function applyHangoutUpdate(
  cached: HangoutSnapshot,
  event: { version: number; permVersion?: number; patch: PatchOp[] },
): ApplyResult {
  if (event.version <= cached.version) return { status: "stale-event" };
  if (event.version !== cached.version + 1) return { status: "refetch" };
  // A permission change invalidates the cached bits: re-fetch the snapshot, never guess them.
  if (event.permVersion !== undefined && event.permVersion !== cached.permVersion) return { status: "refetch" };
  try {
    const next = applyPatch(cached, event.patch);
    const checked = HangoutSnapshot.safeParse({ ...next, version: event.version, permVersion: cached.permVersion });
    // A patch must not break the snapshot's shape or move it to another hangout.
    if (!checked.success || checked.data.hangoutId !== cached.hangoutId) return { status: "refetch" };
    return { status: "applied", snapshot: checked.data };
  } catch (e) {
    if (e instanceof PatchError) return { status: "refetch" };
    throw e;
  }
}

export type ReadyAction =
  | { kind: "keep" }
  | { kind: "replace"; snapshot: HangoutSnapshot }
  | { kind: "wipe" }
  | { kind: "refetch" };

/** Turn READY's per-hangout answer into a cache action (MASTER_PLAN §7.1 step 2). */
export function reconcileReady(cached: HangoutSnapshot | undefined, sync: HangoutSync): ReadyAction {
  switch (sync.kind) {
    case "removed":
      return { kind: "wipe" };
    case "full":
      return { kind: "replace", snapshot: sync.snapshot };
    case "unchanged":
      return cached && cached.version === sync.version ? { kind: "keep" } : { kind: "refetch" };
    case "patches": {
      if (!cached || cached.version !== sync.fromVersion) return { kind: "refetch" };
      if (sync.toPermVersion !== undefined && sync.toPermVersion !== cached.permVersion) return { kind: "refetch" };
      let snap = cached;
      for (let i = 0; i < sync.patches.length; i++) {
        const r = applyHangoutUpdate(snap, { version: sync.fromVersion + i + 1, patch: sync.patches[i]! });
        if (r.status !== "applied") return { kind: "refetch" };
        snap = r.snapshot;
      }
      return snap.version === sync.toVersion ? { kind: "replace", snapshot: snap } : { kind: "refetch" };
    }
  }
}

/** Server side: what READY should send for one hangout, given the client's cached version. */
export function planReadyForHangout(args: {
  clientVersion: number | undefined;
  current: HangoutSnapshot | null; // null = user is no longer a member
  patchLog: ReadonlyMap<number, PatchOp[]>; // version → patch that produced it
  maxPatches?: number;
}): HangoutSync {
  const { clientVersion, current, patchLog } = args;
  const max = args.maxPatches ?? 50;
  if (!current) return { kind: "removed" };
  if (clientVersion === undefined || clientVersion > current.version) return { kind: "full", snapshot: current };
  if (clientVersion === current.version) return { kind: "unchanged", version: current.version };
  const gap = current.version - clientVersion;
  if (gap > max) return { kind: "full", snapshot: current };
  const patches: PatchOp[][] = [];
  for (let v = clientVersion + 1; v <= current.version; v++) {
    const p = patchLog.get(v);
    if (!p) return { kind: "full", snapshot: current };
    patches.push(p);
  }
  return { kind: "patches", fromVersion: clientVersion, toVersion: current.version, toPermVersion: current.permVersion, patches };
}

export const etagForHangout = (s: Pick<HangoutSnapshot, "hangoutId" | "version">) => `"h:${s.hangoutId}:${s.version}"`;
export const etagForPrefs = (version: number) => `"p:${version}"`;
