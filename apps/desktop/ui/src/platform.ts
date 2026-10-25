// Where the shared UI is running: inside the desktop app (Tauri) or a browser.
import type { CacheStore } from "@hangcord/cache";
import type { CacheVersions, User } from "@hangcord/protocol";

export const isDesktop = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
let invokeP: Promise<Invoke> | null = null;
/** Loaded only inside the desktop app, so the web bundle stays small. */
const tauri = () => (invokeP ??= import("@tauri-apps/api/core").then((m) => m.invoke as Invoke));

export type ApiReply = { status: number; body: unknown; etag?: string | null };
export type GatewayEvent = { connectionId: string; kind: "frame"; frame: unknown } | { connectionId: string; kind: "closed"; code: number };
export interface DesktopPort {
  status(): Promise<{ configured: boolean; user: User | null }>;
  password(email: string, password: string): Promise<User>;
  google(link?: { email: string; password: string }): Promise<User>;
  cancel(): Promise<void>;
  logout(): Promise<void>;
  request(method: string, path: string, body?: unknown, etag?: string): Promise<ApiReply>;
  listen(handler: (event: GatewayEvent) => void): Promise<() => void>;
  connect(roomId: string, cache: CacheVersions): Promise<string>;
  send(connectionId: string, frame: unknown): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
}

/** Secrets and provider tokens remain in the native core; the UI receives only user data. */
export class NativeDesktopPort implements DesktopPort {
  async status() { return isDesktop() ? (await tauri())<{ configured: boolean; user: User | null }>("auth_status") : { configured: false, user: null }; }
  async password(email: string, password: string) { return (await tauri())<User>("auth_password", { email, password }); }
  async google(link?: { email: string; password: string }) { return (await tauri())<User>("auth_google", { link: link ?? null }); }
  async cancel() { await (await tauri())("auth_cancel"); }
  async logout() { await (await tauri())("auth_logout"); }
  async request(method: string, path: string, body?: unknown, etag?: string) {
    return (await tauri())<ApiReply>("api_request", { method, path: `/v1${path}`, body: body ?? null, etag: etag ?? null });
  }
  async listen(handler: (event: GatewayEvent) => void) {
    if (!isDesktop()) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<GatewayEvent>("gateway://event", (event) => handler(event.payload));
  }
  async connect(roomId: string, cache: CacheVersions) { return (await tauri())<string>("gateway_connect", { roomId, cache }); }
  async send(connectionId: string, frame: unknown) { await (await tauri())("gateway_send", { connectionId, frame }); }
  async disconnect(connectionId: string) { await (await tauri())("gateway_disconnect", { connectionId }); }
}

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
