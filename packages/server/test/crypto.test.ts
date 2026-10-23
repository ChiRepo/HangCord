/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { createCipheriv, createHash, hkdfSync } from "node:crypto";
import { importKek, newHangoutKey, openHangoutKey, roomKey, sealBody, openBody, type WrappedKey } from "../src/crypto";
const bytes = (seed: number) => Uint8Array.from({ length: 32 }, (_, i) => (seed + i) % 256);
const b64 = (v: Uint8Array) => Buffer.from(v).toString("base64");
const ids = { hangoutId: "test-hangout", roomId: "test-room", messageId: "test-message", epoch: 1 };

describe("documented encryption formats", () => {
  it("unwraps an independently constructed HKDF/AES-GCM record and checks the SHA-256 fingerprint", async () => {
    const kek = bytes(1), hsk = bytes(45), iv = bytes(80).slice(0, 12);
    const wrapKey = Buffer.from(hkdfSync("sha256", kek, "hangcord", "hangcord/kek-wrap/v1", 32));
    const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
    cipher.setAAD(Buffer.from(`${ids.hangoutId}|1|1`));
    const ct = Buffer.concat([cipher.update(hsk), cipher.final(), cipher.getAuthTag()]);
    const record: WrappedKey = { epoch: 1, kekVersion: 1, iv: b64(iv), wrappedKey: b64(ct), fingerprint: createHash("sha256").update(hsk).digest("hex").slice(0, 16) };
    const opened = await openHangoutKey(await importKek(b64(kek)), ids.hangoutId, record);
    expect(opened.extractable).toBe(false);
    const derived = await roomKey(opened, ids.roomId);
    const envelope = JSON.parse(await sealBody(derived, ids, "original 🦉"));
    expect(Object.keys(envelope).sort()).toEqual(["ct", "epoch", "iv", "v"]);
    expect(await openBody(derived, ids, JSON.stringify(envelope))).toBe("original 🦉");
    await expect(openHangoutKey(await importKek(b64(kek)), ids.hangoutId, { ...record, fingerprint: "0000000000000000" })).rejects.toThrow();
  });
  it("uses fresh IVs and rejects tampered, swapped and wrong-epoch message records", async () => {
    const key = await importKek(b64(bytes(2)));
    const { wrapped, hsk } = await newHangoutKey(key, ids.hangoutId, 1);
    expect(wrapped.fingerprint).toMatch(/^[0-9a-f]{16}$/);
    const derived = await roomKey(hsk, ids.roomId);
    const one = await sealBody(derived, ids, "test body");
    const two = await sealBody(derived, ids, "test body");
    expect(one).not.toBe(two);
    for (const changed of [{ ...ids, epoch: 2 }, { ...ids, messageId: "other" }, { ...ids, hangoutId: "other" }, { ...ids, roomId: "other" }]) await expect(openBody(derived, changed, one)).rejects.toThrow();
    const envelope = JSON.parse(one); envelope.extra = true;
    await expect(openBody(derived, ids, JSON.stringify(envelope))).rejects.toThrow();
    await expect(openBody(derived, ids, one + ".extra")).rejects.toThrow();
    await expect(openHangoutKey(key, "other-hangout", wrapped)).rejects.toThrow();
    await expect(openHangoutKey(await importKek(b64(bytes(3))), ids.hangoutId, wrapped)).rejects.toThrow();
  });
  it("rejects malformed KEKs and envelopes", async () => {
    for (const raw of ["", "junk", b64(new Uint8Array(31))]) await expect(importKek(raw)).rejects.toThrow();
    const { hsk } = await newHangoutKey(await importKek(b64(bytes(9))), ids.hangoutId, 1);
    const key = await roomKey(hsk, ids.roomId);
    for (const body of ["null", "{}", "[]", JSON.stringify({ v: 2, epoch: 1, iv: "", ct: "" })]) await expect(openBody(key, ids, body)).rejects.toThrow();
  });
});
