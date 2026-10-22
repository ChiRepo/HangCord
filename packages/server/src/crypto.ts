// Hangout keys and message bodies at rest (ACCESS_AND_SETTINGS §10, SECRETS_AND_SENSITIVE_DATA.md).
//   KEK (HANGCORD_KEK_V1, Workers secret, gateway only)
//     └─ wraps the hangout secret key (HSK, 32 random bytes) — AES-256-GCM, AAD = hangoutId|epoch|kekVersion
//          └─ HKDF-SHA256(HSK, salt = roomId, info = "hangcord/room-data/v1") → room data key
//               └─ encrypts each message body — AES-256-GCM, AAD = hangoutId|roomId|messageId|epoch
// A leaked D1 / Firestore / R2 copy holds only ciphertext. Plain keys exist only in Durable Object memory.

const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const KEK_VERSION = 1;

/** The KEK secret is 32 bytes, base64 (owner generates it offline: `openssl rand -base64 32`). */
export async function importKek(secret: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try { raw = fromB64(secret.trim()); } catch { throw new Error("kek_malformed"); }
  if (raw.length !== 32) throw new Error("kek_malformed");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export interface WrappedKey { epoch: number; kekVersion: number; iv: string; wrapped: string; fingerprint: string }

const aadKey = (hangoutId: string, epoch: number, kekVersion: number) => enc.encode(`${hangoutId}|${epoch}|${kekVersion}`);

async function fingerprint(raw: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`hangcord/key-fingerprint/v1|${toB64(raw)}`)));
  return toB64(h.slice(0, 12));
}

/** New hangout secret key for `epoch`, returned wrapped (to store) and imported for HKDF (to use). */
export async function newHangoutKey(kek: CryptoKey, hangoutId: string, epoch: number): Promise<{ wrapped: WrappedKey; hsk: CryptoKey }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadKey(hangoutId, epoch, KEK_VERSION) }, kek, raw));
  const wrapped: WrappedKey = { epoch, kekVersion: KEK_VERSION, iv: toB64(iv), wrapped: toB64(ct), fingerprint: await fingerprint(raw) };
  const hsk = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  raw.fill(0);
  return { wrapped, hsk };
}

/** Unwrap and self-check (fingerprint) — a swapped or tampered record fails closed. */
export async function openHangoutKey(kek: CryptoKey, hangoutId: string, w: WrappedKey): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(w.iv), additionalData: aadKey(hangoutId, w.epoch, w.kekVersion) }, kek, fromB64(w.wrapped),
  ));
  if ((await fingerprint(raw)) !== w.fingerprint) throw new Error("key_fingerprint_mismatch");
  const hsk = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  raw.fill(0);
  return hsk;
}

export const roomKey = (hsk: CryptoKey, roomId: string) =>
  crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(roomId), info: enc.encode("hangcord/room-data/v1") },
    hsk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );

const aadMsg = (hangoutId: string, roomId: string, messageId: string, epoch: number) => enc.encode(`${hangoutId}|${roomId}|${messageId}|${epoch}`);

/** `v1.<iv>.<ciphertext>` (base64). */
export async function sealBody(key: CryptoKey, ids: { hangoutId: string; roomId: string; messageId: string; epoch: number }, body: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadMsg(ids.hangoutId, ids.roomId, ids.messageId, ids.epoch) }, key, enc.encode(body)));
  return `v1.${toB64(iv)}.${toB64(ct)}`;
}

export async function openBody(key: CryptoKey, ids: { hangoutId: string; roomId: string; messageId: string; epoch: number }, sealed: string): Promise<string> {
  const [v, iv, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("bad_ciphertext");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv), additionalData: aadMsg(ids.hangoutId, ids.roomId, ids.messageId, ids.epoch) }, key, fromB64(ct));
  return dec.decode(pt);
}
