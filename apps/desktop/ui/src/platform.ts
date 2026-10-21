// Where the shared UI is running: inside the desktop app (Tauri) or a browser.
import type { CacheStore } from "@hangcord/cache";

export const isDesktop = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
let invokeP: Promise<Invoke> | null = null;
/** Loaded only inside the desktop app, so the web bundle stays small. */
const tauri = () => (invokeP ??= import("@tauri-apps/api/core").then((m) => m.invoke as Invoke));

/** packages/cache's CacheStore backed by the Rust core's encrypted SQLite (MASTER_PLAN §7.1). */
export class TauriCacheStore implements CacheStore {
  async get<T>(key: string): Promise<T | undefined> {
    const raw = await (await tauri())<string | null>("cache_get", { key });
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }
  async put<T>(key: string, value: T): Promise<void> {
    await (await tauri())("cache_put", { key, value: JSON.stringify(value) });
  }
  async delete(key: string): Promise<void> {
    await (await tauri())("cache_delete", { key });
  }
  async keys(prefix: string): Promise<string[]> {
    return (await tauri())<string[]>("cache_keys", { prefix });
  }
  /** Sign-out: the Rust core deletes, VACUUMs and truncates the WAL. */
  async wipe(): Promise<void> {
    await (await tauri())("cache_wipe");
  }
}

export type GovernorStatus = {
  totalBytes: number;
  availableBytes: number;
  profile: "lite" | "balanced" | "smooth" | "rich" | "max";
  budgetBytes: number;
  usedBytes: number;
  zone: "green" | "yellow" | "red";
  lightweight: boolean;
  processCount: number;
};

/** Lightweight mode forces the leanest memory profile (MASTER_PLAN §3.2, §11). */
export async function setLightweight(on: boolean): Promise<GovernorStatus> {
  return (await tauri())<GovernorStatus>("set_lightweight", { on });
}

/** Live memory readout from the governor (MASTER_PLAN §11). Returns an unsubscribe function. */
export async function watchGovernor(onStatus: (s: GovernorStatus) => void): Promise<() => void> {
  const invoke = await tauri();
  onStatus(await invoke<GovernorStatus>("governor_status"));
  const { listen } = await import("@tauri-apps/api/event");
  return listen<GovernorStatus>("governor://status", (e) => onStatus(e.payload));
}
