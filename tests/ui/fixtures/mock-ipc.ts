import type { Page } from "@playwright/test";
import type { HangoutSnapshot, Preferences, Room, User } from "@hangcord/protocol";
import { SAMPLE_HANGOUT, SAMPLE_PREFS } from "./sample";

export type MockGatewayFrame = {
  op: string;
  d?: Record<string, unknown>;
  s?: number;
  [key: string]: unknown;
};

export type MockApiRequest = { method: string; path: string; body?: unknown; etag?: string };
export type MockIpcCommand =
  | "auth_status"
  | "auth_password"
  | "auth_google"
  | "auth_cancel"
  | "auth_logout"
  | "api_request"
  | "gateway_connect"
  | "gateway_send"
  | "gateway_disconnect"
  | "plugin:event|listen"
  | "plugin:event|unlisten"
  | "plugin:event|emit";
export type MockCommand = { command: MockIpcCommand; args: unknown };
export type MockTestControl = {
  failNext(method: string, path: string, status: number, body?: unknown): void;
  emitGateway(connectionId: string, frame: MockGatewayFrame): void;
  closeGateway(connectionId: string, code?: number): void;
  disconnectOnNextMessage(): void;
  setPermissions(roomId: string, bits: string): void;
  requests: MockApiRequest[];
  sentFrames: Array<{ connectionId: string; frame: MockGatewayFrame }>;
  commands: MockCommand[];
  snapshot: HangoutSnapshot;
  prefs: Preferences;
  connections: string[];
};

declare global {
  interface Window {
    __HANGCORD_TEST__: MockTestControl;
  }
}

export const TEST_USER = {
  id: "test-user",
  displayName: "Test User",
  email: "test@example.test",
  avatarUrl: null,
  createdAt: 1_700_000_000_000,
};

type MockOptions = {
  authenticated?: boolean;
  email?: string;
  password?: string;
  permissions?: Record<string, string>;
  sendBit?: number;
  emptyHangouts?: boolean;
};

type InitOptions = MockOptions & {
  user: typeof TEST_USER;
  snapshot: typeof SAMPLE_HANGOUT;
  prefs: typeof SAMPLE_PREFS;
};

/** Install before navigation. This stays in the browser test context; production has no test bridge. */
export async function installMockIpc(page: Page, options: MockOptions = {}) {
  await page.addInitScript((cfg: InitOptions) => {
const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const asFrame = (value: unknown): MockGatewayFrame => {
  const record = asRecord(value);
  return { ...record, op: typeof record.op === "string" ? record.op : "" };
};

const asPreferenceValues = (value: unknown): Preferences["values"] => {
  const entries = Object.entries(asRecord(value)).filter(([, entry]) => {
    const record = asRecord(entry);
    return "value" in record && Number.isInteger(record.updatedAt);
  });
  return Object.fromEntries(entries) as Preferences["values"];
};


    type Callback = (value: unknown) => void;
    type Listener = { event: string; callback: number };
    type Failure = { method: string; path: string; status: number; body: unknown };
    type Frame = MockGatewayFrame;
    const callbacks = new Map<number, Callback>();
    const listeners = new Map<number, Listener>();
    const connections = new Map<string, { roomId: string; cache: unknown }>();
    const failures: Failure[] = [];
    const requests: MockApiRequest[] = [];
    const sentFrames: Array<{ connectionId: string; frame: Frame }> = [];
    const commands: MockCommand[] = [];
    let nextCallback = 1;
    let nextEvent = 1;
    let nextConnection = 1;
    let disconnectOnNextMessage = false;
    let user: User | null = cfg.authenticated === false ? null : structuredClone(cfg.user);
    let snapshot: HangoutSnapshot = structuredClone(cfg.snapshot);
    let prefs: Preferences = structuredClone(cfg.prefs);
    if (cfg.permissions) snapshot.myPermissions = { ...snapshot.myPermissions, ...cfg.permissions };
    const populateRoomPermissions = (value: HangoutSnapshot) => {
      const permissions = { ...value.myPermissions };
      for (const room of value.rooms) {
        if (room.type === "category" || permissions[room.id] !== undefined) continue;
        permissions[room.id] = room.categoryId ? permissions[room.categoryId] ?? "0" : "0";
      }
      return { ...value, myPermissions: permissions };
    };
    snapshot = populateRoomPermissions(snapshot);

    const emit = (event: string, payload: unknown) => {
      for (const [id, listener] of listeners) {
        if (listener.event === event) callbacks.get(listener.callback)?.({ event, id, payload });
      }
    };
    const answer = (status: number, body: unknown, etag?: string) => ({ status, body, ...(etag ? { etag } : {}) });
    const dispatch = (connectionId: string, payload: unknown) => setTimeout(() => emit("gateway://event", { connectionId, kind: "frame", frame: payload }), 0);
    const userFor = (email: string) => ({ ...cfg.user, email, displayName: email === cfg.email ? "Linked Test User" : cfg.user.displayName });
    const roomBits = (roomId: string) => {
      const room = snapshot.rooms.find((entry) => entry.id === roomId);
      const categoryId = room?.categoryId;
      return BigInt(snapshot.myPermissions[roomId] ?? (categoryId ? snapshot.myPermissions[categoryId] : undefined) ?? "0");
    };

    const apiRequest = (arg: Record<string, unknown>) => {
      const method = String(arg.method ?? "").toUpperCase();
      const rawPath = String(arg.path ?? "");
      const path = rawPath.startsWith("/v1/") ? rawPath.slice(3) : rawPath;
      const body = asRecord(arg.body);
      const etag = typeof arg.etag === "string" ? arg.etag : undefined;
      requests.push({ method, path, body: arg.body, etag });
      const failureIndex = failures.findIndex((f) => f.method === method && (f.path === path || path.startsWith(`${f.path}?`)));
      if (failureIndex >= 0) {
        const failure = failures.splice(failureIndex, 1)[0]!;
        return answer(failure.status, failure.body);
      }
      if (method === "GET" && path === "/hangouts") {
        if (cfg.emptyHangouts) return answer(200, []);
        return answer(200, [{ id: snapshot.hangoutId, name: snapshot.hangout.name, icon: null, ownerId: user?.id ?? "test-user", version: snapshot.version }]);
      }
      const snapMatch = path.match(/^\/hangouts\/([^/]+)\/snapshot$/);
      if (method === "GET" && snapMatch) {
        const etag = `"h:${snapshot.hangoutId}:${snapshot.version}"`;
        return arg.etag === etag ? answer(304, null, etag) : answer(200, snapshot, etag);
      }
      if (method === "GET" && path === "/me/preferences") {
        const etag = `"p:${prefs.version}"`;
        return arg.etag === etag ? answer(304, null, etag) : answer(200, prefs, etag);
      }
      if (method === "PATCH" && path === "/me/preferences") {
        if (etag && etag !== `"p:${prefs.version}"`) return answer(412, { error: "version_conflict" });
        prefs = { version: prefs.version + 1, values: { ...prefs.values, ...asPreferenceValues(body.set) } };
        return answer(200, prefs, `"p:${prefs.version}"`);
      }
      if (method === "POST" && path === "/hangouts") {
        const id = `test-hangout-${Date.now().toString(36)}`;
        const name = String(body.name ?? "New Hangout").trim();
        const created = { id, name, icon: null, ownerId: user?.id ?? cfg.user.id, version: 1 };
        const seed = structuredClone(snapshot);
        const oldId = seed.hangoutId;
        seed.hangoutId = id;
        seed.hangout = { ...seed.hangout, id, name };
        seed.rooms = seed.rooms.map((room) => ({ ...room, hangoutId: id }));
        if (seed.myPermissions[oldId]) delete seed.myPermissions[oldId];
        snapshot = populateRoomPermissions({ ...seed, version: 1, permVersion: 1 });
        return answer(201, created);
      }
      if (method === "POST" && /^\/hangouts\/[^/]+\/rooms$/.test(path)) {
        const type = body.type === "lounge" ? "lounge" : "text";
        const categoryId = typeof body.categoryId === "string" ? body.categoryId : null;
        const room: Room = {
          id: `test-room-${Date.now().toString(36)}`, hangoutId: snapshot.hangoutId,
          type, categoryId,
          position: snapshot.rooms.filter((entry) => entry.categoryId === categoryId).length,
          name: String(body.name ?? "new-room"), syncWithCategory: body.guidelines !== "own", overrides: [],
        };
        snapshot = populateRoomPermissions({ ...snapshot, version: snapshot.version + 1, rooms: [...snapshot.rooms, room] });
        return answer(201, room);
      }
      const messagesMatch = path.match(/^\/rooms\/([^/]+)\/messages(?:\?.*)?$/);
      if (messagesMatch && method === "GET") {
        const bits = roomBits(messagesMatch[1]!);
        if ((bits & 3n) !== 3n) return answer(403, { error: "forbidden" });
        return answer(200, { messages: [], hasMore: false });
      }
      if (messagesMatch && method === "POST") {
        if ((roomBits(messagesMatch[1]!) & BigInt(cfg.sendBit ?? 0)) === 0n) return answer(403, { error: "forbidden" });
        const body = asRecord(arg.body);
        const message = { id: `msg-${String(body.nonce ?? "")}`, roomId: messagesMatch[1], hangoutId: snapshot.hangoutId, authorId: user?.id ?? cfg.user.id, content: String(body.content ?? ""), createdAt: Date.now(), editedAt: null };
        return answer(201, message);
      }
      return answer(404, { error: "not_found", message: `Mock route missing: ${method} ${path}` });
    };

    const invoke = async (command: MockIpcCommand, rawArgs: unknown = {}) => {
      const args = asRecord(rawArgs);
      commands.push({ command, args: structuredClone(args) });
      if (command.startsWith("plugin:event|")) {
        if (command === "plugin:event|listen") {
          const eventId = nextEvent++;
          listeners.set(eventId, { event: String(args.event ?? ""), callback: Number(args.handler) });
          return eventId;
        }
        if (command === "plugin:event|unlisten") {
          listeners.delete(Number(args.eventId));
          return null;
        }
        if (command === "plugin:event|emit") {
          emit(String(args.event ?? ""), args.payload);
          return null;
        }
      }
      switch (command) {
        case "auth_status": return { configured: true, user };
        case "auth_password": {
          if (args.email === cfg.email && args.password === cfg.password) {
            user = userFor(String(args.email));
            return structuredClone(user);
          }
          throw "auth_failed";
        }
        case "auth_google": {
          if (!args.link) throw "account_link_required";
          user = userFor(cfg.email ?? cfg.user.email ?? "linked@example.test");
          return structuredClone(user);
        }
        case "auth_cancel": return null;
        case "auth_logout": user = null; return null;
        case "api_request": return apiRequest(args);
        case "gateway_connect": {
          const connectionId = `mock-connection-${nextConnection++}`;
          connections.set(connectionId, { roomId: String(args.roomId ?? ""), cache: args.cache });
          dispatch(connectionId, { op: "HELLO", d: { heartbeatIntervalMs: 30_000 } });
          dispatch(connectionId, {
            op: "READY", d: {
              sessionId: "mock-session",
              preferences: { kind: "full", preferences: structuredClone(prefs) },
              hangouts: { [snapshot.hangoutId]: { kind: "full", snapshot: structuredClone(snapshot) } },
            },
          });
          return connectionId;
        }
        case "gateway_send": {
          const connectionId = String(args.connectionId ?? "");
          const frame = asFrame(args.frame);
          sentFrames.push({ connectionId, frame: structuredClone(frame) });
          if (frame.op === "MESSAGE_CREATE") {
            const d = frame.d ?? {};
            const roomId = String(d.roomId ?? "");
            const nonce = String(d.nonce ?? "");
            const content = String(d.content ?? "");
            const bits = roomBits(roomId);
            if ((bits & BigInt(cfg.sendBit ?? 0)) === 0n) {
              dispatch(connectionId, { op: "MESSAGE_ACK", d: { nonce, ok: false, error: "forbidden" } });
              return null;
            }
            if (disconnectOnNextMessage) {
              disconnectOnNextMessage = false;
              connections.delete(connectionId);
              setTimeout(() => emit("gateway://event", { connectionId, kind: "closed", code: 1006 }), 0);
              return null;
            }
            const message = {
              id: `msg-${nonce}`, roomId, hangoutId: snapshot.hangoutId,
              authorId: user?.id ?? cfg.user.id, content, createdAt: Date.now(), editedAt: null,
            };
            dispatch(connectionId, { op: "MESSAGE_CREATE", d: { message, nonce }, s: 1 });
            dispatch(connectionId, { op: "MESSAGE_ACK", d: { nonce, ok: true, messageId: message.id, seq: 1 } });
          }
          return null;
        }
        case "gateway_disconnect": connections.delete(String(args.connectionId ?? "")); return null;
        default: throw `unsupported_mock_command:${command}`;
      }
    };

    const internals = {
      invoke,
      transformCallback(callback?: Callback, once = false) {
        const id = nextCallback++;
        if (callback) callbacks.set(id, once ? (value) => { callbacks.delete(id); callback(value); } : callback);
        return id;
      },
      unregisterCallback(id: number) { callbacks.delete(id); },
    };
    const eventInternals = {
      unregisterListener: (_event: string, id: number) => callbacks.delete(id),
    };
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: false, value: internals });
    Object.defineProperty(window, "__TAURI_EVENT_PLUGIN_INTERNALS__", { configurable: false, value: eventInternals });
    const control: MockTestControl = {
      failNext(method: string, path: string, status: number, body: unknown = { error: "mock_failure" }) {
        failures.push({ method: method.toUpperCase(), path, status, body });
      },
      emitGateway(connectionId: string, frame: MockGatewayFrame) { dispatch(connectionId, frame); },
      closeGateway(connectionId: string, code = 1006) {
        connections.delete(connectionId);
        setTimeout(() => emit("gateway://event", { connectionId, kind: "closed", code }), 0);
      },
      disconnectOnNextMessage() { disconnectOnNextMessage = true; },
      setPermissions(roomId: string, bits: string) { snapshot.myPermissions[roomId] = bits; },
      requests,
      sentFrames,
      commands,
      get snapshot() { return structuredClone(snapshot); },
      get prefs() { return structuredClone(prefs); },
      get connections() { return [...connections.keys()]; },
    };
    Object.defineProperty(window, "__HANGCORD_TEST__", { configurable: false, value: control });
  }, {
    ...options,
    email: options.email ?? "test@example.test",
    password: options.password ?? "TestPass123!",
    user: TEST_USER,
    snapshot: SAMPLE_HANGOUT,
    prefs: SAMPLE_PREFS,
    sendBit: 1 << 2,
  } satisfies InitOptions);
}

