import {
  HangoutSnapshot, HangoutSummary, Message, MessageAck, MessageCreateEvent, MessagesPage,
  Preferences, Ready, User, has, type Room,
} from "@hangcord/protocol";
import { ClientCache, EMPTY_PREFS, MemoryCacheStore, setPref } from "@hangcord/cache";
import type { DesktopPort, GatewayEvent } from "./platform";

export type DisplayMessage = Message & { delivery?: "sending" | "failed"; nonce?: string };
export interface LiveState {
  configured: boolean; booting: boolean; busy: boolean; user: User | null; error: string | null;
  hangouts: Pick<HangoutSummary, "id" | "name" | "icon" | "version">[]; snap: HangoutSnapshot | null; prefs: Preferences; roomId: string | null;
  messages: DisplayMessage[]; connection: "offline" | "connecting" | "live" | "paused";
  source: "cache" | "network"; hasMore: boolean;
}
const initial = (): LiveState => ({ configured: false, booting: true, busy: false, user: null, error: null,
  hangouts: [], snap: null, prefs: EMPTY_PREFS, roomId: null, messages: [], connection: "offline", source: "network", hasMore: false });
export const codeOf = (error: unknown): string => {
  if (typeof error === "string" && /^[a-z_]{1,64}$/.test(error)) return error;
  if (error && typeof error === "object") {
    const value = "code" in error ? error.code : "error" in error ? error.error : error instanceof Error ? error.message : null;
    if (typeof value === "string" && /^[a-z_]{1,64}$/.test(value)) return value;
  }
  return "unavailable";
};
const failure = (code: string) => Object.assign(new Error(code), { code });
const summary = (snapshot: HangoutSnapshot): Pick<HangoutSummary, "id" | "name" | "icon" | "version"> => ({ ...snapshot.hangout, id: snapshot.hangoutId, version: snapshot.version });

/** Owns one room connection and bounded view state. Session secrets never enter this class. */
export class LiveClient {
  state = initial();
  private active = true;
  private epoch = 0;
  private authAttempt = 0;
  private selection = 0;
  private connection: string | null = null;
  private connecting = false;
  private early: GatewayEvent[] = [];
  private unlisten?: () => void;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnect?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private zone: "green" | "yellow" | "red" = "green";
  private pending = new Map<string, { message: DisplayMessage; timer?: ReturnType<typeof setTimeout>; posting: boolean }>();
  private cacheQueue: Promise<unknown> = Promise.resolve();
  constructor(readonly port: DesktopPort, private cache: ClientCache, private changed: (state: LiveState) => void) {}
  private emit(patch: Partial<LiveState>) { if (this.active) { this.state = { ...this.state, ...patch }; this.changed(this.state); } }
  private current(epoch: number, selection?: number) { return this.active && this.epoch === epoch && (selection === undefined || this.selection === selection); }
  private cacheWork<T>(epoch: number, work: () => Promise<T>): Promise<T> {
    const result = this.cacheQueue.then(() => { if (!this.current(epoch)) throw failure("cancelled"); return work(); });
    this.cacheQueue = result.catch(() => undefined);
    return result;
  }
  private get cap() { return this.zone === "green" ? 100 : this.zone === "yellow" ? 30 : 0; }
  private paused() { return this.zone === "red"; }
  private trim(messages: DisplayMessage[]): DisplayMessage[] {
    const unique = new Map<string, DisplayMessage>();
    for (const message of messages) unique.set(message.id, message);
    const values = [...unique.values()];
    return [...(this.cap ? values.filter((m) => !m.delivery).slice(-this.cap) : []), ...values.filter((m) => m.delivery).slice(-20)];
  }
  async start() {
    try {
      const status = await this.port.status().catch((error: unknown) => {
        // A configured build with a temporarily locked keychain must still permit retrying sign-in.
        if (codeOf(error) !== "keychain_unavailable") throw error;
        this.emit({ error: "keychain_unavailable" });
        return { configured: true, user: null };
      });
      if (!this.active) return;
      this.emit({ configured: status.configured });
      const off = await this.port.listen((event) => this.onEvent(event));
      if (!this.active) { off(); return; }
      this.unlisten = off;
      if (status.user) await this.adopt(User.parse(status.user));
    } catch (error) { this.emit({ error: codeOf(error) }); }
    finally { this.emit({ booting: false }); }
  }
  async login(kind: "password" | "google", email = "", password = "", link = false) {
    if (this.state.busy) return;
    const attempt = ++this.authAttempt;
    const epoch = this.epoch;
    this.emit({ busy: true, error: null });
    try {
      const user = kind === "password" ? await this.port.password(email, password) : await this.port.google(link ? { email, password } : undefined);
      if (this.current(epoch)) await this.adopt(User.parse(user));
    } catch (error) { if (this.current(epoch)) this.emit({ error: codeOf(error) }); }
    finally { if (this.active && attempt === this.authAttempt) this.emit({ busy: false }); }
  }
  async cancelLogin() { ++this.epoch; ++this.authAttempt; await this.port.cancel().catch(() => undefined); this.emit({ busy: false, error: null }); }
  private async adopt(user: User) {
    const epoch = ++this.epoch;
    this.emit({ user, error: null });
    try { await this.cacheWork(epoch, () => this.cache.bindAccount(user.id)); }
    catch {
      if (!this.current(epoch)) return;
      this.cache = new ClientCache(new MemoryCacheStore(), "desktop");
      await this.cache.bindAccount(user.id);
      this.emit({ error: "cache_unavailable" });
    }
    const [snapshots, prefs] = await this.cacheWork(epoch, () => Promise.all([this.cache.cachedHangouts(), this.cache.preferences()]));
    if (!this.current(epoch)) return;
    const snap = snapshots[0] ?? null;
    this.emit({ hangouts: snapshots.map(summary), prefs, snap, roomId: snap?.rooms.find((r) => r.type === "text")?.id ?? null, source: snapshots.length ? "cache" : "network", booting: false });
    await this.refresh();
  }
  private async request(method: string, path: string, body?: unknown, etag?: string) {
    const epoch = this.epoch;
    let response;
    try { response = await this.port.request(method, path, body, etag); }
    catch (error) {
      if (this.current(epoch) && ["reauth_required", "sign_in_required"].includes(codeOf(error))) await this.logout();
      throw error;
    }
    if (!this.current(epoch)) throw failure("cancelled");
    if (response.status === 401) { await this.logout(); throw failure("sign_in_required"); }
    if (response.status >= 400) throw failure(codeOf(response.body));
    return response;
  }
  async refresh() {
    const epoch = this.epoch;
    try {
      const [h, p] = await Promise.all([this.request("GET", "/hangouts"), this.request("GET", "/me/preferences")]);
      const hangouts = HangoutSummary.array().parse(h.body), prefs = Preferences.parse(p.body);
      await this.cacheWork(epoch, async () => {
        for (const old of await this.cache.cachedHangouts()) if (!hangouts.some((item) => item.id === old.hangoutId)) await this.cache.wipeHangout(old.hangoutId);
        await this.cache.savePreferences(prefs);
      });
      if (!this.current(epoch)) return;
      this.emit({ hangouts, prefs, source: "network", error: null });
      const selected = hangouts.find((item) => item.id === this.state.snap?.hangoutId) ?? hangouts[0];
      if (selected) await this.selectHangout(selected.id);
      else { await this.closeRoom(); this.emit({ snap: null, roomId: null, messages: [] }); }
    } catch (error) { if (this.current(epoch)) this.emit({ error: codeOf(error), connection: "offline" }); }
  }
  async selectHangout(id: string) {
    const epoch = this.epoch;
    const selected = this.selection + 1;
    await this.closeRoom();
    if (!this.current(epoch, selected)) return;
    this.emit({ snap: null, roomId: null, messages: [], error: null });
    try {
      const cached = await this.cacheWork(epoch, () => this.cache.hangout(id));
      if (this.current(epoch, selected) && cached) this.emit({ snap: cached, source: "cache" });
      const snap = HangoutSnapshot.parse((await this.request("GET", `/hangouts/${id}/snapshot`)).body);
      if (!this.current(epoch, selected)) return;
      await this.cacheWork(epoch, () => this.cache.putHangout(snap));
      if (!this.current(epoch, selected)) return;
      this.emit({ snap, source: "network" });
      const room = snap.rooms.find((item) => item.type === "text" && has(BigInt(snap.myPermissions[item.id] ?? "0"), "VIEW_ROOM"));
      if (room) await this.selectRoom(room.id);
    } catch (error) {
      if (!this.current(epoch, selected)) return;
      if (["not_found", "forbidden"].includes(codeOf(error))) { await this.cacheWork(epoch, () => this.cache.wipeHangout(id)); this.emit({ snap: null }); }
      this.emit({ error: codeOf(error) });
    }
  }
  async selectRoom(id: string) {
    const epoch = this.epoch, selected = this.selection + 1;
    await this.closeRoom();
    if (!this.current(epoch, selected)) return;
    this.emit({ roomId: id, messages: [...this.pending.values()].map((item) => item.message).filter((m) => m.roomId === id), hasMore: false, error: null });
    if (this.zone === "red") { this.emit({ connection: "paused" }); return; }
    await this.openRoom();
  }
  private async openRoom() {
    const roomId = this.state.roomId, epoch = this.epoch, selected = this.selection;
    if (!roomId || !this.state.user || this.zone === "red") return;
    this.connecting = true; this.early = []; this.emit({ connection: "connecting" });
    try {
      const versions = await this.cacheWork(epoch, () => this.cache.versions());
      if (!this.current(epoch, selected) || this.paused()) return;
      const id = await this.port.connect(roomId, versions);
      if (!this.current(epoch, selected) || this.paused()) { await this.port.disconnect(id); return; }
      this.connection = id; this.connecting = false;
      const early = this.early; this.early = [];
      for (const event of early) this.onEvent(event);
      await this.history(false);
    } catch (error) {
      if (!this.current(epoch, selected)) return;
      this.connecting = false;
      if (["reauth_required", "sign_in_required"].includes(codeOf(error))) { await this.logout(); return; }
      this.emit({ connection: "offline", error: codeOf(error) });
      // History and REST send remain usable when only the socket is unavailable.
      await this.history(false);
      this.scheduleReconnect();
    }
  }
  async history(older = true) {
    const roomId = this.state.roomId, epoch = this.epoch, selected = this.selection;
    if (!roomId || this.zone === "red") return;
    if (this.state.snap && !has(BigInt(this.state.snap.myPermissions[roomId] ?? "0"), "READ_HISTORY")) return;
    const first = this.state.messages.find((m) => !m.delivery)?.id;
    try {
      const page = MessagesPage.parse((await this.request("GET", `/rooms/${roomId}/messages?limit=${this.cap}${older && first ? `&before=${first}` : ""}`)).body);
      if (!this.current(epoch, selected)) return;
      const current = this.state.messages;
      const merged = [...new Map([...page.messages, ...current].map((m) => [m.id, m])).values()];
      // Explicit older pages replace the view at the memory cap; don't silently discard the requested page.
      this.emit({ messages: older ? merged.slice(0, this.cap) : this.trim(merged), hasMore: page.hasMore });
    } catch (error) {
      if (!this.current(epoch, selected)) return;
      if (["not_found", "forbidden"].includes(codeOf(error))) {
        await this.closeRoom(); this.emit({ messages: [], connection: "offline" });
        const id = this.state.snap?.hangoutId;
        if (id) await this.cacheWork(epoch, () => this.cache.wipeHangout(id));
      }
      this.emit({ error: codeOf(error) });
    }
  }
  private onEvent(event: GatewayEvent) {
    if (!this.active) return;
    if (!this.connection && this.connecting) { if (this.early.length < 20) this.early.push(event); return; }
    if (event.connectionId !== this.connection) return;
    if (event.kind === "closed") {
      this.connection = null; clearInterval(this.heartbeat); this.emit({ connection: "offline" });
      if (event.code === 4004) { this.emit({ messages: [], error: "not_found" }); void this.refresh(); }
      else this.scheduleReconnect();
      return;
    }
    const frame = event.frame;
    if (!frame || typeof frame !== "object" || !("op" in frame)) return;
    if (frame.op === "HELLO" && "d" in frame) {
      const interval = (frame.d as { heartbeatIntervalMs?: unknown })?.heartbeatIntervalMs;
      if (typeof interval !== "number" || !Number.isFinite(interval) || interval < 5000 || interval > 120000) return;
      clearInterval(this.heartbeat);
      const id = this.connection;
      this.heartbeat = setInterval(() => { if (id && this.connection === id) void this.port.send(id, { op: "HEARTBEAT", d: { seq: null } }).catch(() => this.scheduleReconnect()); }, interval);
    } else if (frame.op === "READY") {
      const parsed = Ready.safeParse(frame);
      if (!parsed.success) return;
      this.retries = 0; this.emit({ connection: "live", error: null });
      const epoch = this.epoch;
      void this.cacheWork(epoch, async () => {
        const refetch = await this.cache.applyReady(parsed.data.d.hangouts);
        const pref = parsed.data.d.preferences;
        if (pref.kind === "full") await this.cache.savePreferences(pref.preferences);
        const snap = this.state.snap ? await this.cache.hangout(this.state.snap.hangoutId) : undefined;
        const prefs = await this.cache.preferences();
        return { snap, prefs, refetch };
      }).then(async ({ snap, prefs, refetch }) => {
        if (!this.current(epoch) || event.connectionId !== this.connection) return;
        const id = this.state.snap?.hangoutId;
        if (id && parsed.data.d.hangouts[id]?.kind === "removed") {
          await this.closeRoom();
          this.emit({ snap: null, roomId: null, messages: [], hangouts: this.state.hangouts.filter((h) => h.id !== id) });
          await this.refresh();
        } else if (id && refetch.includes(id)) await this.selectHangout(id);
        else this.emit({ snap: snap ?? this.state.snap, prefs });
      }).catch((error) => { if (this.current(epoch)) this.emit({ error: codeOf(error) }); });
    } else if (frame.op === "MESSAGE_CREATE") {
      const parsed = MessageCreateEvent.safeParse(frame);
      if (!parsed.success || parsed.data.d.message.roomId !== this.state.roomId) return;
      const { message, nonce } = parsed.data.d;
      if (nonce) this.finish(nonce, message);
      else this.emit({ messages: this.trim([...this.state.messages, message]) });
    } else if (frame.op === "MESSAGE_ACK") {
      const parsed = MessageAck.safeParse(frame);
      if (!parsed.success) return;
      const ack = parsed.data.d, pending = this.pending.get(ack.nonce);
      if (!pending) return;
      if (ack.ok) this.finish(ack.nonce, { ...pending.message, id: ack.messageId, delivery: undefined });
      else this.failSend(ack.nonce, ack.error);
    }
  }
  private scheduleReconnect() {
    if (this.reconnect || !this.active || !this.state.user || !this.state.roomId || this.zone === "red") return;
    this.emit({ connection: "offline" });
    this.reconnect = setTimeout(() => {
      this.reconnect = undefined;
      void this.closeSocket().then(() => this.openRoom());
    }, Math.min(30000, 1000 * 2 ** Math.min(this.retries++, 5)));
  }
  async send(content: string, retryNonce?: string) {
    const roomId = this.state.roomId, user = this.state.user, snap = this.state.snap;
    if (!user || !roomId || !snap || this.zone === "red" || !content.trim() || content.length > 4000) return;
    if (!has(BigInt(snap.myPermissions[roomId] ?? "0"), "SEND_MESSAGES")) { this.emit({ error: "forbidden" }); return; }
    if (!retryNonce && this.pending.size >= (this.zone === "green" ? 20 : 5)) { this.emit({ error: "outbox_full" }); return; }
    const nonce = retryNonce ?? crypto.randomUUID();
    if (this.pending.get(nonce)?.posting) return;
    const message: DisplayMessage = { id: `pending-${nonce}`, hangoutId: snap.hangoutId, roomId, authorId: user.id, content, createdAt: Date.now(), editedAt: null, nonce, delivery: "sending" };
    this.pending.set(nonce, { message, posting: false });
    this.emit({ messages: this.trim([...this.state.messages.filter((m) => m.nonce !== nonce), message]), error: null });
    if (this.connection && this.state.connection === "live") {
      const pending = this.pending.get(nonce)!;
      pending.timer = setTimeout(() => { void this.fallback(nonce); }, 5000);
      try { await this.port.send(this.connection, { op: "MESSAGE_CREATE", d: { roomId, content, nonce } }); return; }
      catch { /* Same nonce makes a fallback safe after an ambiguous socket send. */ }
    }
    await this.fallback(nonce);
  }
  private async fallback(nonce: string) {
    const item = this.pending.get(nonce), epoch = this.epoch;
    if (!item || item.posting || this.zone === "red") return;
    item.posting = true; clearTimeout(item.timer);
    try {
      const response = await this.request("POST", `/rooms/${item.message.roomId}/messages`, { content: item.message.content, nonce });
      if (this.current(epoch)) this.finish(nonce, Message.parse(response.body));
    } catch (error) { if (this.current(epoch)) this.failSend(nonce, codeOf(error)); }
  }
  private finish(nonce: string, message: DisplayMessage) {
    const item = this.pending.get(nonce); clearTimeout(item?.timer); this.pending.delete(nonce);
    if (message.roomId !== this.state.roomId) return;
    const clean = { ...message, delivery: undefined, nonce: undefined };
    this.emit({ messages: this.trim([...this.state.messages.filter((m) => m.nonce !== nonce && m.id !== message.id), clean]) });
  }
  private failSend(nonce: string, code: string) {
    const item = this.pending.get(nonce); if (!item) return;
    clearTimeout(item.timer); item.posting = false; item.message.delivery = "failed";
    this.emit({ messages: this.state.messages.map((m) => m.nonce === nonce ? { ...m, delivery: "failed" } : m), error: code });
  }
  async createHangout(name: string) {
    const item = HangoutSummary.parse((await this.request("POST", "/hangouts", { name })).body);
    this.emit({ hangouts: [...this.state.hangouts, item] }); await this.selectHangout(item.id);
  }
  async addRoom(category: Room, type: "text" | "lounge", name: string, guidelines: "category" | "own"): Promise<string | null> {
    const snap = this.state.snap;
    if (!snap) return "not_found";
    try {
      const response = await this.request("POST", `/hangouts/${snap.hangoutId}/rooms`, { categoryId: category.id, type, name, guidelines });
      const created = response.body as { id?: string };
      await this.selectHangout(snap.hangoutId);
      if (created.id) await this.selectRoom(created.id);
      return null;
    } catch (error) { return codeOf(error); }
  }
  async preference(key: string, value: unknown) {
    const epoch = this.epoch;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const prefs = this.state.prefs;
        const desired = setPref(prefs, key, value, Date.now());
        const response = await this.port.request("PATCH", "/me/preferences", { set: { [key]: desired.values[key] } }, `"p:${prefs.version}"`);
        if (!this.current(epoch)) return;
        if (response.status === 401) { await this.logout(); return; }
        if (response.status === 412) { this.emit({ prefs: Preferences.parse((response.body as { current: unknown }).current) }); continue; }
        if (response.status >= 400) throw failure(codeOf(response.body));
        const saved = Preferences.parse(response.body);
        await this.cacheWork(epoch, () => this.cache.savePreferences(saved)); this.emit({ prefs: saved }); return;
      }
      throw failure("version_conflict");
    } catch (error) {
      if (!this.current(epoch)) return;
      if (["reauth_required", "sign_in_required"].includes(codeOf(error))) await this.logout();
      else this.emit({ error: codeOf(error) });
    }
  }
  pressure(zone: "green" | "yellow" | "red") {
    if (this.zone === zone) return;
    this.zone = zone;
    if (zone === "red") {
      void this.closeSocket(); clearTimeout(this.reconnect); this.reconnect = undefined;
      for (const [nonce] of this.pending) this.failSend(nonce, "memory_paused");
      this.emit({ messages: this.state.messages.filter((m) => m.delivery), connection: "paused" });
    } else { this.emit({ messages: this.trim(this.state.messages) }); if (!this.connection) this.scheduleReconnect(); }
  }
  private async closeSocket() {
    clearInterval(this.heartbeat); this.heartbeat = undefined;
    const id = this.connection; this.connection = null; this.connecting = false; this.early = [];
    if (id) await this.port.disconnect(id).catch(() => undefined);
  }
  private async closeRoom() {
    ++this.selection; clearTimeout(this.reconnect); this.reconnect = undefined;
    await this.closeSocket();
  }
  private clearPending() {
    for (const item of this.pending.values()) clearTimeout(item.timer);
    this.pending.clear();
  }
  async logout() {
    ++this.epoch; this.emit({ ...initial(), booting: false, configured: this.state.configured });
    this.clearPending();
    await this.closeRoom();
    await this.cacheQueue;
    await this.cache.wipeAll().catch(() => undefined);
    try { await this.port.logout(); } catch (error) { this.emit({ error: codeOf(error) }); }
  }
  async dispose() { this.active = false; ++this.epoch; this.clearPending(); this.unlisten?.(); await this.closeRoom(); }
}
