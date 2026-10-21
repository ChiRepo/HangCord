/**
 * Storage port. Real adapters arrive in Phase 1: SQLite in the desktop Rust core (via IPC) and
 * SQLite-WASM on OPFS with an IndexedDB fallback on web/phones. Both encrypt at rest with a
 * per-device key (MASTER_PLAN §7.1). The in-memory adapter is for tests and first paint.
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  /** Sign-out: wipe everything, including old pages on disk (desktop: VACUUM + WAL truncate). */
  wipe?(): Promise<void>;
}

/** Same rules as the desktop's Rust store (apps/desktop/src-tauri/src/cache.rs), so web tests catch them. */
export const MAX_KEY_LEN = 200;
export const MAX_VALUE_BYTES = 2 * 1024 * 1024;
const KEY_RE = /^[a-z0-9:_.-]+$/;
export const isValidCacheKey = (k: string) => k.length > 0 && k.length <= MAX_KEY_LEN && KEY_RE.test(k);

export class CacheStoreError extends Error {
  constructor(readonly code: "bad_key" | "too_large") {
    super(code);
  }
}

export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, unknown>();
  async get<T>(key: string) {
    const v = this.map.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async put<T>(key: string, value: T) {
    if (!isValidCacheKey(key)) throw new CacheStoreError("bad_key");
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_VALUE_BYTES) throw new CacheStoreError("too_large");
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async keys(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }
  async wipe() {
    this.map.clear();
  }
}

export const KEYS = {
  prefs: "prefs",
  hangout: (id: string) => `hangout:${id}`,
  hangoutPrefix: "hangout:",
  lru: "lru:hangouts",
} as const;
