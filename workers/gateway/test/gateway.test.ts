import { describe, expect, it } from "vitest";
import { helloFrame, onFrame, HEARTBEAT_INTERVAL_MS } from "../src/session";

describe("gateway phase 0", () => {
  it("says HELLO with the heartbeat interval", () => {
    expect(helloFrame()).toEqual({ op: "HELLO", d: { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS } });
  });
  it("acks heartbeats", () => {
    expect(onFrame(JSON.stringify({ op: "HEARTBEAT", d: { seq: null } }))).toEqual({ reply: [{ op: "HEARTBEAT_ACK", d: {} }] });
  });
  it("closes on junk, unknown ops and oversized frames", () => {
    expect(onFrame("{nope").close?.code).toBe(4002);
    expect(onFrame(JSON.stringify({ op: "HACK", d: {} })).close?.code).toBe(4002);
    expect(onFrame("x".repeat(70_000)).close?.code).toBe(4008);
    expect(onFrame(JSON.stringify({ op: "HEARTBEAT", d: { seq: null }, pad: "€".repeat(30_000) })).close?.code).toBe(4008); // 90 KB in UTF-8
  });
  it("rejects server-only ops sent by a client", () => {
    expect(onFrame(JSON.stringify({ op: "READY", d: {} })).close).toEqual({ code: 4002, reason: "bad_ready" });
    expect(onFrame(JSON.stringify({ op: "SYSTEM_NOTICE", d: { code: "x", message: "y" } })).close).toEqual({ code: 4002, reason: "server_only_op" });
  });
  it("valid but not-yet-built ops close with 4003", () => {
    expect(onFrame(JSON.stringify({ op: "TYPING_START", d: {} })).close?.code).toBe(4003);
  });
});
