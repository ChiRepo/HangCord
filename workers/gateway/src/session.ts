import { CLIENT_OPS, parseFrame, type GatewayOp } from "@hangcord/protocol";

const MAX_FRAME_BYTES = 64 * 1024;
const encoder = new TextEncoder();

export const HEARTBEAT_INTERVAL_MS = 41_250;

export type Outgoing = { op: string; d: unknown };
export type FrameResult = { reply: Outgoing[]; close?: { code: number; reason: string } };

/** First frame on every connection. */
export const helloFrame = (): Outgoing => ({ op: "HELLO", d: { heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS } });

/**
 * Phase 0 frame handling — pure so it can be tested without a socket. Anything that isn't a
 * valid contract frame closes the socket (4002); ops not yet implemented get 4003.
 */
export function onFrame(text: string): FrameResult {
  // Cheap pre-check, then the real byte count (UTF-8 can be 3× the UTF-16 length).
  if (text.length > MAX_FRAME_BYTES || encoder.encode(text).length > MAX_FRAME_BYTES) return { reply: [], close: { code: 4008, reason: "too_large" } };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { reply: [], close: { code: 4002, reason: "bad_json" } };
  }
  const parsed = parseFrame(raw);
  if (!parsed.ok) return { reply: [], close: { code: 4002, reason: parsed.error } };
  if (!CLIENT_OPS.has(parsed.frame.op as GatewayOp)) return { reply: [], close: { code: 4002, reason: "server_only_op" } };
  switch (parsed.frame.op) {
    case "HEARTBEAT":
      return { reply: [{ op: "HEARTBEAT_ACK", d: {} }] };
    default:
      return { reply: [], close: { code: 4003, reason: "not_available_yet" } };
  }
}
