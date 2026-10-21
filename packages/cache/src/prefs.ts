import type { NewRoomGuidelinesPreference, PrefEntry, Preferences } from "@hangcord/protocol";

export const PREF_KEYS = {
  newRoomGuidelines: "rooms.newRoomGuidelines",
  newRoomGuidelinesFor: (hangoutId: string) => `hangouts.${hangoutId}.rooms.newRoomGuidelines`,
} as const;

export const EMPTY_PREFS: Preferences = { version: 0, values: {} };

/**
 * Per-key merge: the newest `updatedAt` wins; ties keep the server's value. A deleted key is kept
 * as a tombstone `{ value: null, updatedAt }` so an older copy on another device can't revive it.
 */
export function mergePreferences(local: Preferences, server: Preferences): Preferences {
  const values: Record<string, PrefEntry> = { ...server.values };
  for (const [k, mine] of Object.entries(local.values)) {
    const theirs = server.values[k];
    if (!theirs || mine.updatedAt > theirs.updatedAt) values[k] = mine;
  }
  return { version: Math.max(local.version, server.version), values };
}

/** Keys the local copy changed after the server's copy — what to re-send after a 412. */
export function pendingKeys(local: Preferences, server: Preferences): string[] {
  return Object.entries(local.values)
    .filter(([k, v]) => !server.values[k] || v.updatedAt > server.values[k]!.updatedAt)
    .map(([k]) => k);
}

/** Read a preference value, treating tombstones as absent. */
export function getPref(prefs: Preferences, key: string): unknown {
  const v = prefs.values[key]?.value;
  return v === null ? undefined : v;
}

export const deletePref = (prefs: Preferences, key: string, now: number) => setPref(prefs, key, null, now);

export function setPref(prefs: Preferences, key: string, value: unknown, now: number): Preferences {
  return { version: prefs.version, values: { ...prefs.values, [key]: { value, updatedAt: now } } };
}

const CHOICES = new Set<NewRoomGuidelinesPreference>(["category", "own", "ask"]);

/**
 * Which option the "Add to ‹category›" dialog pre-selects (ACCESS_AND_SETTINGS §7.1).
 * Per-hangout preference beats the global one; default is "category". `null` = nothing pre-selected.
 */
export function newRoomGuidelinesDefault(prefs: Preferences, hangoutId: string): "category" | "own" | null {
  const raw = getPref(prefs, PREF_KEYS.newRoomGuidelinesFor(hangoutId)) ?? getPref(prefs, PREF_KEYS.newRoomGuidelines);
  const pick = CHOICES.has(raw as NewRoomGuidelinesPreference) ? (raw as NewRoomGuidelinesPreference) : "category";
  return pick === "ask" ? null : pick;
}
