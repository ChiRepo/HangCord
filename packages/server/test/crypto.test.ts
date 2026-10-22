import { describe, expect, it } from "vitest";
import { importKek, newHangoutKey, openBody, openHangoutKey, roomKey, sealBody } from "../src/crypto";

const kekB64 = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
const ids = { hangoutId: "h1", roomId: "r1", messageId: "m1", epoch: 1 };

describe("at-rest crypto (ACCESS_AND_SETTINGS §10)", () => {
  it("wraps, unwraps and encrypts message bodies; ciphertext is not the text", async () => {
    const kek = await importKek(kekB64);
    const { wrapped, hsk } = await newHangoutKey(kek, "h1", 1);
    const sealed = await sealBody(await roomKey(hsk, "r1"), ids, "hello night owls");
    expect(sealed).not.toContain("hello");
    const again = await openHangoutKey(kek, "h1", wrapped);
    expect(await openBody(await roomKey(again, "r1"), ids, sealed)).toBe("hello night owls");
  });
  it("fails closed: wrong KEK, moved key, moved message, wrong room key", async () => {
    const kek = await importKek(kekB64);
    const { wrapped, hsk } = await newHangoutKey(kek, "h1", 1);
    const other = await importKek(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"));
    await expect(openHangoutKey(other, "h1", wrapped)).rejects.toThrow();
    await expect(openHangoutKey(kek, "h2", wrapped)).rejects.toThrow();
    const sealed = await sealBody(await roomKey(hsk, "r1"), ids, "x");
    await expect(openBody(await roomKey(hsk, "r1"), { ...ids, messageId: "m2" }, sealed)).rejects.toThrow();
    await expect(openBody(await roomKey(hsk, "r2"), { ...ids, roomId: "r2" }, sealed)).rejects.toThrow();
  });
  it("rejects a malformed KEK", async () => {
    await expect(importKek("short")).rejects.toThrow("kek_malformed");
    await expect(importKek(Buffer.alloc(16).toString("base64"))).rejects.toThrow("kek_malformed");
  });
});
