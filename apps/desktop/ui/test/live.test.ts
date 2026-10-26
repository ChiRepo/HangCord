import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientCache, MemoryCacheStore } from "@hangcord/cache";
import { BIT, type HangoutSnapshot, type User } from "@hangcord/protocol";
import { LiveClient, codeOf, type LiveState } from "../src/live";
import type { ApiReply, DesktopPort, GatewayEvent } from "../src/platform";

const user: User = { id: "u1", displayName: "Test", email: "test@example.test", avatarUrl: null, createdAt: 1 };
const bits = String(BIT.VIEW_ROOM | BIT.READ_HISTORY | BIT.SEND_MESSAGES);
const snapshot: HangoutSnapshot = {
  hangoutId: "h1", version: 1, permVersion: 1, hangout: { id: "h1", name: "Test" },
  rooms: ["r1", "r2"].map((id, position) => ({ id, hangoutId: "h1", type: "text", name: id, position, syncWithCategory: false, overrides: [] })),
  roles: [], me: { userId: "u1", roles: [] }, myPermissions: { r1: bits, r2: bits },
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const clients: LiveClient[] = [];
const ticks = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fixture() {
  let handler: (event: GatewayEvent) => void = () => {};
  let counter = 0;
  const request = vi.fn(async (method: string, path: string, body?: unknown): Promise<ApiReply> => {
    if (path === "/hangouts") return { status: 200, body: [{ ...snapshot.hangout, ownerId: user.id, version: 1 }] };
    if (path === "/me/preferences") return { status: 200, body: { version: 0, values: {} } };
    if (path.endsWith("/snapshot")) return { status: 200, body: snapshot };
    if (method === "POST") {
      const input = body as { content: string; nonce: string };
      return { status: 201, body: { id: `m-${input.nonce}`, roomId: path.split("/")[2], hangoutId: "h1", authorId: "u1", content: input.content, createdAt: 1, editedAt: null } };
    }
    return { status: 200, body: { messages: [], hasMore: false } };
  });
  const port: DesktopPort = {
    status: vi.fn(async () => ({ configured: true, user })), password: vi.fn(async () => user), google: vi.fn(async () => user),
    cancel: vi.fn(async () => {}), logout: vi.fn(async () => {}), request,
    listen: vi.fn(async (fn) => { handler = fn; return () => {}; }),
    connect: vi.fn(async () => `connection-${++counter}`), send: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
  };
  const store = new MemoryCacheStore(), cache = new ClientCache(store, "desktop");
  const states: LiveState[] = [];
  const client = new LiveClient(port, cache, (state) => states.push(state)); clients.push(client);
  const emit = (frame: unknown, connectionId = `connection-${counter}`) => handler({ connectionId, kind: "frame", frame });
  const ready = () => emit({ op: "READY", d: { sessionId: "session1", hangouts: { h1: { kind: "unchanged", version: 1 } }, preferences: { kind: "unchanged", version: 0 } } });
  return { client, port, request, store, cache, emit, ready, states };
}
afterEach(async () => { for (const client of clients.splice(0)) await client.dispose(); vi.useRealTimers(); });

describe("native-backed live state", () => {
  it("keeps the restored hangout visible while refreshing the same snapshot", async () => {
    const f = fixture();
    await f.cache.bindAccount(user.id);
    await f.cache.putHangout(snapshot);
    const network = deferred<ApiReply>();
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((method, path, body) => path.endsWith("/snapshot") ? network.promise : original(method, path, body));
    const starting = f.client.start();
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledWith("GET", "/hangouts/h1/snapshot", undefined, undefined));
    const restored = f.states.findIndex((state) => state.source === "cache" && state.snap?.hangoutId === "h1");
    expect(restored).toBeGreaterThanOrEqual(0);
    expect(f.states.slice(restored).every((state) => state.snap?.rooms.some((room) => room.id === "r2"))).toBe(true);
    network.resolve({ status: 200, body: { ...snapshot, version: 2 } });
    await starting;
    expect(f.client.state.snap?.version).toBe(2);
  });
  it("accepts only short error codes from string and object IPC errors", () => {
    expect(codeOf("account_link_required")).toBe("account_link_required");
    expect(codeOf({ code: "reauth_required" })).toBe("reauth_required");
    expect(codeOf("/private/path or sensitive detail")).toBe("unavailable");
  });
  it("removes the retained snapshot when the server denies its refresh", async () => {
    const f = fixture(); await f.client.start();
    f.request.mockResolvedValueOnce({ status: 403, body: { error: "forbidden" } });
    await f.client.selectHangout("h1");
    expect(f.client.state.snap).toBeNull();
    expect(await f.cache.hangout("h1")).toBeUndefined();
  });
  it("does not show the previous snapshot while switching hangouts", async () => {
    const f = fixture(); await f.client.start();
    const network = deferred<ApiReply>();
    f.request.mockReturnValueOnce(network.promise);
    const switching = f.client.selectHangout("h2");
    await vi.waitFor(() => expect(f.request).toHaveBeenCalledWith("GET", "/hangouts/h2/snapshot", undefined, undefined));
    expect(f.client.state.snap).toBeNull();
    network.resolve({ status: 404, body: { error: "not_found" } });
    await switching;
  });
  it("discards history arriving after a room switch", async () => {
    const f = fixture(); await f.client.start();
    const late = deferred<ApiReply>(); f.request.mockImplementationOnce(() => late.promise);
    const loading = f.client.history();
    await f.client.selectRoom("r2");
    late.resolve({ status: 200, body: { messages: [{ id: "old", roomId: "r1", hangoutId: "h1", authorId: "u1", content: "old room", createdAt: 1 }], hasMore: false } });
    await loading;
    expect(f.client.state.roomId).toBe("r2"); expect(f.client.state.messages).toEqual([]);
  });
  it("clears local account data when native refresh requires sign-in", async () => {
    const f = fixture(); await f.client.start();
    f.request.mockRejectedValueOnce({ code: "reauth_required" });
    await f.client.history();
    expect(f.client.state.user).toBeNull(); expect(await f.store.keys("")).toEqual([]);
    expect(f.port.logout).toHaveBeenCalledOnce();
  });
  it("does not reopen an in-flight socket after red memory pressure", async () => {
    const f = fixture(); await f.client.start();
    const socket = deferred<string>(); vi.mocked(f.port.connect).mockReturnValueOnce(socket.promise);
    const switching = f.client.selectRoom("r2"); await ticks();
    f.client.pressure("red"); socket.resolve("late-socket"); await switching;
    expect(f.port.disconnect).toHaveBeenCalledWith("late-socket"); expect(f.client.state.connection).toBe("paused");
  });
  it("reuses the nonce for ambiguous sends and ignores stale connection events", async () => {
    vi.useFakeTimers(); const f = fixture(); await f.client.start(); f.ready(); await ticks();
    expect(f.client.state.connection).toBe("live");
    await f.client.send("hello");
    const sent = vi.mocked(f.port.send).mock.calls[0]![1] as { d: { nonce: string } };
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.request).toHaveBeenCalledWith("POST", "/rooms/r1/messages", { content: "hello", nonce: sent.d.nonce }, undefined);
    f.emit({ op: "MESSAGE_CREATE", d: { message: f.client.state.messages[0], nonce: sent.d.nonce }, s: 1 });
    f.emit({ op: "MESSAGE_CREATE", d: { message: { ...f.client.state.messages[0], id: "stale" } }, s: 2 }, "old-connection");
    expect(f.client.state.messages).toHaveLength(1); expect(f.client.state.messages[0]?.delivery).toBeUndefined();
  });
  it("keeps a pending send when switching rooms without showing it in the other room", async () => {
    vi.useFakeTimers(); const f = fixture(); await f.client.start(); f.ready(); await ticks();
    await f.client.send("pending"); await f.client.selectRoom("r2");
    expect(f.client.state.messages).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.request).toHaveBeenCalledWith("POST", "/rooms/r1/messages", expect.objectContaining({ content: "pending" }), undefined);
    expect(f.client.state.messages).toEqual([]);
  });
  it("bounds live history and unloads it under memory pressure", async () => {
    const f = fixture(); await f.client.start();
    for (let i = 0; i < 130; i++) f.emit({ op: "MESSAGE_CREATE", d: { message: { id: `m${i}`, roomId: "r1", hangoutId: "h1", authorId: "u1", content: "hello", createdAt: i, editedAt: null } }, s: i + 1 });
    expect(f.client.state.messages).toHaveLength(100);
    f.client.pressure("yellow"); expect(f.client.state.messages).toHaveLength(30);
    f.client.pressure("red"); expect(f.client.state.messages).toEqual([]);
  });
  it("ignores a cancelled login result while a newer login remains busy", async () => {
    const f = fixture(); vi.mocked(f.port.status).mockResolvedValue({ configured: true, user: null }); await f.client.start();
    const old = deferred<User>(), newer = deferred<User>();
    vi.mocked(f.port.google).mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const first = f.client.login("google"); await f.client.cancelLogin(); const second = f.client.login("google");
    old.resolve(user); await first; expect(f.client.state.busy).toBe(true); expect(f.client.state.user).toBeNull();
    newer.resolve(user); await second; expect(f.client.state.user?.id).toBe("u1"); expect(f.client.state.busy).toBe(false);
  });
});
