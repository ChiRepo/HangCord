import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { GatewayOp, parseFrame, CreateRoomRequest, Preferences, MessageCreateEvent, MessageAck, SendMessageRequest } from "../src";

const here = dirname(fileURLToPath(import.meta.url));

describe("gateway contract", () => {
  it("lists every op named in MASTER_PLAN §6 and ACCESS_AND_SETTINGS §14", () => {
    const plan = readFileSync(resolve(here, "../../../docs/MASTER_PLAN.md"), "utf8");
    const access = readFileSync(resolve(here, "../../../docs/ACCESS_AND_SETTINGS.md"), "utf8");
    const gwLine = plan.slice(plan.indexOf("**Gateway (WSS)** ops:")).split("\n")[0]!;
    const accLine = access.slice(access.indexOf("Gateway events:")).split("\n")[0]!;
    const named = new Set<string>();
    for (const line of [gwLine, accLine]) {
      for (const m of line.matchAll(/`([A-Z_]+)(?:\/([A-Z_/]+))?/g)) {
        const first = m[1]!;
        named.add(first);
        // `ROOM_CREATE/UPDATE/DELETE` → ROOM_CREATE, ROOM_UPDATE, ROOM_DELETE
        const prefix = first.slice(0, first.lastIndexOf("_") + 1);
        for (const tail of (m[2] ?? "").split("/").filter(Boolean)) named.add(tail.includes("_") ? tail : prefix + tail);
      }
    }
    const known = new Set<string>(GatewayOp.options);
    const missing = [...named].filter((op) => !known.has(op));
    expect(missing).toEqual([]);
  });

  it("accepts a valid IDENTIFY with cache versions and rejects a malformed one", () => {
    const good = { op: "IDENTIFY", d: { token: "t", client: { platform: "web-mobile", version: "0.0.1" }, cache: { prefsVersion: 3, hangouts: { h1: 7 } } } };
    expect(parseFrame(good).ok).toBe(true);
    const bad = { op: "IDENTIFY", d: { token: "t", client: { platform: "toaster", version: "1" }, cache: { prefsVersion: -1, hangouts: {} } } };
    expect(parseFrame(bad)).toEqual({ ok: false, error: "bad_identify" });
  });

  it("rejects unknown ops", () => {
    expect(parseFrame({ op: "DROP_TABLES", d: {} })).toEqual({ ok: false, error: "bad_envelope" });
  });

  it("passes non-detailed ops through the envelope", () => {
    expect(parseFrame({ op: "TYPING_START", d: { roomId: "r1" } }).ok).toBe(true);
  });

  it("CreateRoomRequest requires a guidelines choice", () => {
    expect(CreateRoomRequest.safeParse({ type: "lounge", name: "Lounge", categoryId: "c1" }).success).toBe(false);
    expect(CreateRoomRequest.safeParse({ type: "lounge", name: "Lounge", categoryId: "c1", guidelines: "own" }).success).toBe(true);
  });

  it("Preferences carry per-key timestamps", () => {
    expect(Preferences.safeParse({ version: 1, values: { theme: { value: "dark", updatedAt: 1 } } }).success).toBe(true);
    expect(Preferences.safeParse({ version: 1, values: { theme: "dark" } }).success).toBe(false);
  });

  it("validates MESSAGE_CREATE in both directions without adding duplicate discriminators", () => {
    const request = { op: "MESSAGE_CREATE", d: { roomId: "room_1", content: "hello", nonce: "nonce_123" } };
    expect(parseFrame(request)).toMatchObject({ ok: true, detailed: true });
    expect(parseFrame({ ...request, d: { ...request.d, roomId: "Bad ID" } }).ok).toBe(false);
    const rest = { content: "hello", nonce: "nonce_123" };
    expect(SendMessageRequest.safeParse(rest).success).toBe(true);
    expect(SendMessageRequest.safeParse(request.d).success).toBe(false); // room identity comes from the REST path
    expect(SendMessageRequest.safeParse({ ...rest, content: "  " }).success).toBe(false);
    expect(SendMessageRequest.safeParse({ ...rest, nonce: "short" }).success).toBe(false);
    expect(SendMessageRequest.safeParse({ ...rest, content: "x".repeat(4001) }).success).toBe(false);

    const event = { op: "MESSAGE_CREATE", d: { message: { id: "m1", roomId: "room_1", hangoutId: "h1", authorId: "u1", content: "hello", createdAt: 1, editedAt: null }, nonce: "nonce_123" }, s: 1 };
    expect(MessageCreateEvent.safeParse(event).success).toBe(true);
    expect(parseFrame(event)).toMatchObject({ ok: true, detailed: false });
    expect(parseFrame({ ...event, s: undefined })).toEqual({ ok: false, error: "bad_message_create" });
  });

  it("requires a sequence on successful ACKs and a short error on refusal", () => {
    expect(MessageAck.safeParse({ op: "MESSAGE_ACK", d: { nonce: "nonce_123", ok: true, messageId: "m1", seq: 9 } }).success).toBe(true);
    expect(MessageAck.safeParse({ op: "MESSAGE_ACK", d: { nonce: "nonce_123", ok: false, error: "rate_limited" } }).success).toBe(true);
    expect(parseFrame({ op: "MESSAGE_ACK", d: { nonce: "nonce_123", ok: true, messageId: "m1" } })).toEqual({ ok: false, error: "bad_message_ack" });
  });
});
