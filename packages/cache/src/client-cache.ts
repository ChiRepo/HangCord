import { HangoutSnapshot, Preferences, type CacheVersions, type HangoutSync } from "@hangcord/protocol";
import { KEYS, type CacheStore } from "./store";
import { EMPTY_PREFS, mergePreferences } from "./prefs";
import { applyHangoutUpdate, reconcileReady } from "./hangouts";
import type { PatchOp } from "@hangcord/protocol";

export type Platform = "desktop" | "web" | "web-mobile";

/** On-disk snapshot limits per platform (MASTER_PLAN §7.1). */
export const MAX_HANGOUT_SNAPSHOTS: Record<Platform, number> = { desktop: 50, web: 50, "web-mobile": 20 };

/**
 * The client-side cache used by desktop, web and phones. It never decides access — it only
 * makes the UI instant. Every action is still checked by the server.
 */
export class ClientCache {
  constructor(
    private readonly store: CacheStore,
    private readonly platform: Platform,
    private readonly now: () => number = Date.now,
  ) {}

  /** Bind non-secret cached data to one account; switching accounts wipes the previous copy. */
  async bindAccount(uid: string): Promise<void> {
    if (!uid || uid.length > 128) throw new Error("bad_account");
    if (await this.store.get<string>("account") === uid) return;
    await this.wipeAll();
    await this.store.put("account", uid);
  }

  /** Validated snapshots for immediate first paint. Access must still be checked online. */
  async cachedHangouts(): Promise<HangoutSnapshot[]> {
    const snapshots: HangoutSnapshot[] = [];
    for (const key of await this.store.keys(KEYS.hangoutPrefix)) {
      const snapshot = await this.read(key, HangoutSnapshot);
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots.slice(0, MAX_HANGOUT_SNAPSHOTS[this.platform]);
  }

  /** Everything read back is checked against the contract; an old or damaged shape is a cache miss. */
  private async read<T>(key: string, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): Promise<T | undefined> {
    const raw = await this.store.get<unknown>(key);
    if (raw === undefined) return undefined;
    const r = schema.safeParse(raw);
    if (r.success) return r.data;
    await this.store.delete(key);
    return undefined;
  }

  async preferences(): Promise<Preferences> {
    return (await this.read(KEYS.prefs, Preferences)) ?? EMPTY_PREFS;
  }

  async savePreferences(server: Preferences): Promise<Preferences> {
    const merged = mergePreferences(await this.preferences(), server);
    await this.store.put(KEYS.prefs, merged);
    return merged;
  }

  async hangout(id: string): Promise<HangoutSnapshot | undefined> {
    const snap = await this.read(KEYS.hangout(id), HangoutSnapshot);
    if (snap) await this.touch(id);
    return snap;
  }

  async putHangout(snapshot: HangoutSnapshot): Promise<string[]> {
    await this.store.put(KEYS.hangout(snapshot.hangoutId), snapshot);
    return this.touch(snapshot.hangoutId);
  }

  /** Versions to send in IDENTIFY. */
  async versions(): Promise<CacheVersions> {
    const hangouts: Record<string, number> = {};
    for (const key of await this.store.keys(KEYS.hangoutPrefix)) {
      const snap = await this.read(key, HangoutSnapshot);
      if (snap) hangouts[snap.hangoutId] = snap.version;
    }
    return { prefsVersion: (await this.preferences()).version, hangouts };
  }

  /** Apply READY. Returns hangout ids that still need a GET /hangouts/:id/snapshot. */
  async applyReady(hangouts: Record<string, HangoutSync>): Promise<string[]> {
    const refetch: string[] = [];
    for (const [id, sync] of Object.entries(hangouts)) {
      const action = reconcileReady(await this.read(KEYS.hangout(id), HangoutSnapshot), sync);
      if (action.kind === "wipe") await this.wipeHangout(id);
      else if (action.kind === "replace") await this.putHangout(action.snapshot);
      else if (action.kind === "refetch") refetch.push(id);
    }
    return refetch;
  }

  /** Apply a live HANGOUT_UPDATE. Returns true when the caller must re-fetch the snapshot. */
  async applyUpdate(hangoutId: string, event: { version: number; permVersion?: number; patch: PatchOp[] }): Promise<boolean> {
    const cached = await this.read(KEYS.hangout(hangoutId), HangoutSnapshot);
    if (!cached) return true;
    const r = applyHangoutUpdate(cached, event);
    if (r.status === "applied") await this.store.put(KEYS.hangout(hangoutId), r.snapshot);
    return r.status === "refetch";
  }

  /**
   * Apply a live PREFERENCES_UPDATE. Returns true when a version was missed and the caller must
   * re-fetch GET /me/preferences. A key set to `null` is a deletion (tombstone) so it can't come back.
   */
  async applyPreferencesUpdate(event: { version: number; set: Preferences["values"] }): Promise<boolean> {
    const local = await this.preferences();
    if (event.version <= local.version) return false;
    if (event.version !== local.version + 1) return true;
    const merged = mergePreferences(local, { version: event.version, values: { ...local.values, ...event.set } });
    await this.store.put(KEYS.prefs, { ...merged, version: event.version });
    return false;
  }

  /** Kicked, banned, left or hangout deleted. Messages/media caches hook in here in Phase 1. */
  async wipeHangout(id: string): Promise<void> {
    await this.store.delete(KEYS.hangout(id));
    const lru = ((await this.store.get<string[]>(KEYS.lru)) ?? []).filter((x) => x !== id);
    await this.store.put(KEYS.lru, lru);
  }

  /** Sign-out wipes everything on this device. */
  async wipeAll(): Promise<void> {
    if (this.store.wipe) return this.store.wipe();
    for (const key of await this.store.keys("")) await this.store.delete(key);
  }

  /** Mark as recently used; evict beyond the platform limit. Returns evicted ids. */
  private async touch(id: string): Promise<string[]> {
    const lru = ((await this.store.get<string[]>(KEYS.lru)) ?? []).filter((x) => x !== id);
    lru.unshift(id);
    const max = MAX_HANGOUT_SNAPSHOTS[this.platform];
    const evicted = lru.splice(max);
    for (const e of evicted) await this.store.delete(KEYS.hangout(e));
    await this.store.put(KEYS.lru, lru);
    return evicted;
  }
}
