// Local protocol fixture for the built desktop app. This exercises native HTTP/WebSocket
// transport and keychain persistence; it does not simulate Firebase or Cloudflare providers.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import assert from "node:assert/strict";

export const PORT = 39431;
export const API = `http://127.0.0.1:${PORT}`;
export const GATEWAY = `ws://127.0.0.1:${PORT}`;
const USER = { id: "desktop_test_user", displayName: "Desktop Tester", email: "desktop@example.test", avatarUrl: null, createdAt: 1 };
const TOKEN = "desktop-fixture-session-token-1234567890";
const REFRESH = "desktop-fixture-refresh-token-1234567890";
const BITS = String((1n << 40n) | 7n);
const room = (id, hangoutId, type, name, categoryId, position) => ({ id, hangoutId, type, name, categoryId, position, syncWithCategory: !!categoryId, overrides: [] });
const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body == null ? "" : JSON.stringify(body));
};

function frame(socket, value) {
  const payload = Buffer.from(JSON.stringify(value));
  const head = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  socket.write(Buffer.concat([head, payload]));
}

function readFrames(socket, onFrame) {
  let buffer = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const masked = !!(buffer[1] & 0x80);
      const size = buffer[1] & 0x7f;
      const offset = size === 126 ? 4 : 2;
      if (!masked || size === 127) { socket.destroy(); return; }
      if (buffer.length < offset) return;
      const length = size === 126 ? buffer.readUInt16BE(2) : size;
      if (length > 64 * 1024) { socket.destroy(); return; }
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      const opcode = buffer[0] & 15;
      buffer = buffer.subarray(offset + 4 + length);
      if (opcode === 8) { socket.end(Buffer.from([0x88, 0])); return; }
      if (opcode === 1) onFrame(JSON.parse(payload.toString()));
    }
  });
}

export async function startBackend() {
  const state = { requests: [], identifies: [], messages: [], sockets: new Set(), hangout: null,
    prefs: { version: 0, values: { "rooms.newRoomGuidelines": { value: "category", updatedAt: 1 } } },
    holdSnapshot: false, waitingSnapshots: [] };
  const snapshot = () => {
    const h = state.hangout;
    return { hangoutId: h.id, version: h.version, permVersion: 1,
      hangout: { id: h.id, name: h.name, icon: null }, rooms: h.rooms,
      roles: [], me: { userId: USER.id, nickname: null, roles: [] },
      myPermissions: Object.fromEntries(h.rooms.map((r) => [r.id, BITS])) };
  };
  const summary = () => state.hangout && { id: state.hangout.id, name: state.hangout.name, icon: null, ownerId: USER.id, version: state.hangout.version };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, API);
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 65536) { json(res, 413, { error: "too_large" }); return; } }
    const body = raw ? JSON.parse(raw) : null;
    state.requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization ?? null, body });
    if (url.pathname === "/v1/auth/password" && req.method === "POST") {
      if (body?.email !== "desktop@example.test" || body?.password !== "fixture-password") return json(res, 401, { error: "invalid_credentials" });
      return json(res, 200, { session: TOKEN, refreshToken: REFRESH, expiresAt: Date.now() + 900000, user: USER });
    }
    if (url.pathname === "/v1/auth/logout" && req.method === "POST") return json(res, 204);
    if (url.pathname === "/v1/auth/refresh" && req.method === "POST" && body?.refreshToken === REFRESH)
      return json(res, 200, { session: TOKEN, refreshToken: REFRESH, expiresAt: Date.now() + 900000, user: USER });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { error: "sign_in_required" });
    if (url.pathname === "/v1/hangouts" && req.method === "GET") return json(res, 200, summary() ? [summary()] : []);
    if (url.pathname === "/v1/hangouts" && req.method === "POST") {
      assert.equal(state.hangout, null);
      const id = "fixture_hangout";
      state.hangout = { id, name: body.name, version: 1, rooms: [room("fixture_category", id, "category", "Hangout", null, 0), room("fixture_general", id, "text", "general", "fixture_category", 0)] };
      return json(res, 201, summary());
    }
    if (url.pathname === "/v1/me/preferences" && req.method === "GET") return json(res, 200, state.prefs, { etag: `"p:${state.prefs.version}"` });
    if (url.pathname === "/v1/me/preferences" && req.method === "PATCH") {
      if (req.headers["if-match"] !== `"p:${state.prefs.version}"`) return json(res, 412, { current: state.prefs });
      state.prefs = { version: state.prefs.version + 1, values: { ...state.prefs.values, ...body.set } };
      return json(res, 200, state.prefs);
    }
    if (url.pathname === "/v1/hangouts/fixture_hangout/snapshot" && req.method === "GET" && state.hangout) {
      if (state.holdSnapshot) { state.waitingSnapshots.push(res); return; }
      return json(res, 200, snapshot());
    }
    if (url.pathname === "/v1/hangouts/fixture_hangout/rooms" && req.method === "POST" && state.hangout) {
      assert.equal(body.categoryId, "fixture_category");
      const created = room("fixture_desktop_room", state.hangout.id, body.type, body.name, body.categoryId, state.hangout.rooms.length);
      created.syncWithCategory = body.guidelines === "category";
      state.hangout.rooms.push(created); state.hangout.version++;
      return json(res, 201, created);
    }
    const messages = /^\/v1\/rooms\/([a-z0-9_-]+)\/messages$/.exec(url.pathname);
    if (messages && req.method === "GET") return json(res, 200, { messages: state.messages.filter((m) => m.roomId === messages[1]), hasMore: false });
    if (messages && req.method === "POST") {
      const message = { id: `fixture_message_${state.messages.length + 1}`, hangoutId: "fixture_hangout", roomId: messages[1], authorId: USER.id,
        content: body.content, createdAt: Date.now(), editedAt: null };
      state.messages.push(message); return json(res, 201, message);
    }
    json(res, 404, { error: "not_found" });
  });
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, API);
    if (url.pathname !== "/v1/gateway" || !url.searchParams.get("room") || !req.headers["sec-websocket-key"]) { socket.destroy(); return; }
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.on("error", () => {}); // Client teardown may reset the test socket.
    state.sockets.add(socket); socket.on("close", () => state.sockets.delete(socket));
    frame(socket, { op: "HELLO", d: { heartbeatIntervalMs: 30000 } });
    readFrames(socket, (value) => {
      if (value.op === "IDENTIFY") {
        assert.equal(value.d.token, TOKEN); assert.equal(value.d.client.platform, "desktop");
        state.identifies.push({ roomId: url.searchParams.get("room"), cache: value.d.cache });
        frame(socket, { op: "READY", d: { sessionId: "fixture_gateway", preferences: { kind: "full", preferences: state.prefs },
          hangouts: state.hangout ? { [state.hangout.id]: { kind: "full", snapshot: snapshot() } } : {} } });
      } else if (value.op === "HEARTBEAT") frame(socket, { op: "HEARTBEAT_ACK", d: {} });
      else if (value.op === "MESSAGE_CREATE") {
        assert.equal(value.d.roomId, url.searchParams.get("room"));
        const message = { id: `fixture_message_${state.messages.length + 1}`, hangoutId: "fixture_hangout", roomId: value.d.roomId, authorId: USER.id,
          content: value.d.content, createdAt: Date.now(), editedAt: null };
        state.messages.push(message);
        frame(socket, { op: "MESSAGE_ACK", d: { nonce: value.d.nonce, ok: true, messageId: message.id, seq: state.messages.length } });
        frame(socket, { op: "MESSAGE_CREATE", d: { message, nonce: value.d.nonce }, s: state.messages.length });
      }
    });
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(PORT, "127.0.0.1", resolve));
  return { state, releaseSnapshots() { state.holdSnapshot = false; for (const res of state.waitingSnapshots.splice(0)) json(res, 200, snapshot()); },
    async close() { for (const socket of state.sockets) socket.destroy(); await new Promise((resolve) => server.close(resolve)); } };
}
