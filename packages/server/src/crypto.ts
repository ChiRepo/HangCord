// Fixed formats in ACCESS_AND_SETTINGS §10.6. Only HangoutDO may use these helpers in production.
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

function fromB64(value: string, length?: number): Uint8Array {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("bad_ciphertext");
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (toB64(bytes) !== value || (length !== undefined && bytes.length !== length)) {
    bytes.fill(0);
    throw new Error("bad_ciphertext");
  }
  return bytes;
}

function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("bad_ciphertext");
}
function id(value: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("bad_ciphertext");
}
const aad = (...parts: (string | number)[]) => enc.encode(parts.join("|"));
const deriveAes = (base: CryptoKey, salt: string, info: string) => crypto.subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt: enc.encode(salt), info: enc.encode(info) },
  base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
);
export const KEK_VERSION = 1;
export interface WrappedKey { epoch: number; kekVersion: number; iv: string; wrappedKey: string; fingerprint: string }
export interface MessageContext { hangoutId: string; roomId: string; messageId: string; epoch: number }

/** Import only HKDF material; the KEK itself is never an AES key. */
export async function importKek(secret: string): Promise<CryptoKey> {
  let raw: Uint8Array | undefined;
  try {
    raw = fromB64(secret, 32);
    return await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  } catch { throw new Error("kek_malformed"); }
  finally { raw?.fill(0); }
}

async function fingerprint(raw: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  return [...digest.subarray(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Raw secret bytes are overwritten even if derivation, encryption, or import fails. */
export async function newHangoutKey(kek: CryptoKey, hangoutId: string, epoch: number): Promise<{ wrapped: WrappedKey; hsk: CryptoKey }> {
  id(hangoutId); positive(epoch);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  try {
    const wrapKey = await deriveAes(kek, "hangcord", "hangcord/kek-wrap/v1");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(hangoutId, epoch, KEK_VERSION), tagLength: 128 }, wrapKey, raw);
    const hsk = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return { hsk, wrapped: { epoch, kekVersion: KEK_VERSION, iv: toB64(iv), wrappedKey: toB64(new Uint8Array(ciphertext)), fingerprint: await fingerprint(raw) } };
  } finally { raw.fill(0); }
}

/** The caller selects the KEK by the record's version before invoking this function. */
export async function openHangoutKey(kek: CryptoKey, hangoutId: string, record: WrappedKey): Promise<CryptoKey> {
  id(hangoutId); positive(record.epoch); positive(record.kekVersion);
  if (!/^[0-9a-f]{16}$/.test(record.fingerprint)) throw new Error("key_integrity");
  const iv = fromB64(record.iv, 12);
  const wrapped = fromB64(record.wrappedKey, 48);
  const wrapKey = await deriveAes(kek, "hangcord", "hangcord/kek-wrap/v1");
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad(hangoutId, record.epoch, record.kekVersion), tagLength: 128 }, wrapKey, wrapped));
  try {
    if (raw.length !== 32 || await fingerprint(raw) !== record.fingerprint) throw new Error("key_integrity");
    return await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  } finally { raw.fill(0); }
}

export function roomKey(hsk: CryptoKey, roomId: string): Promise<CryptoKey> {
  id(roomId);
  return deriveAes(hsk, roomId, "hangcord/room-data/v1");
}
function messageAad(context: MessageContext): Uint8Array {
  id(context.hangoutId); id(context.roomId); id(context.messageId); positive(context.epoch);
  return aad(context.hangoutId, context.roomId, context.messageId, context.epoch);
}

/** Versioned JSON envelope; every body carries the epoch used to encrypt it. */
export async function sealBody(key: CryptoKey, context: MessageContext, body: string): Promise<string> {
  const additionalData = messageAad(context);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const raw = enc.encode(body);
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key, raw);
    return JSON.stringify({ v: 1, epoch: context.epoch, iv: toB64(iv), ct: toB64(new Uint8Array(ciphertext)) });
  } finally { raw.fill(0); }
}

export async function openBody(key: CryptoKey, context: MessageContext, sealed: string): Promise<string> {
  const additionalData = messageAad(context);
  if (typeof sealed !== "string" || sealed.length > 65_536) throw new Error("bad_ciphertext");
  const body: unknown = JSON.parse(sealed);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("bad_ciphertext");
  const record = body as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "ct,epoch,iv,v" || record.v !== 1 || record.epoch !== context.epoch || typeof record.iv !== "string" || typeof record.ct !== "string") throw new Error("bad_ciphertext");
  const iv = fromB64(record.iv, 12);
  const ciphertext = fromB64(record.ct);
  if (ciphertext.length < 16) throw new Error("bad_ciphertext");
  const raw = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData, tagLength: 128 }, key, ciphertext));
  try { return dec.decode(raw); } finally { raw.fill(0); }
}
