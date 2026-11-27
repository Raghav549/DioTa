import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateRecoveryKey, hashPassword, hashRecoveryKey, safeEqual, verifyPassword } from "@/lib/crypto";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("vault encryption", () => {
  it("round-trips and never stores plaintext", () => {
    const c = encrypt(A, "my secret note");
    expect(c).not.toContain("secret");
    expect(decrypt(A, c)).toBe("my secret note");
  });
  it("uses a fresh IV every time", () => {
    expect(encrypt(A, "x")).not.toBe(encrypt(A, "x"));
  });
  it("isolates users: another user's key cannot decrypt", () => {
    expect(() => decrypt(B, encrypt(A, "private"))).toThrow();
  });
  it("detects tampering", () => {
    const parts = encrypt(A, "private").split(".");
    parts[3] = Buffer.from("tampered-data").toString("base64url");
    expect(() => decrypt(A, parts.join("."))).toThrow();
  });
});

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const h = await hashPassword("Correct-Horse-9!");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-9!", h)).toBe(true);
    expect(await verifyPassword("wrong-password", h)).toBe(false);
    expect(await hashPassword("Correct-Horse-9!")).not.toBe(h);
  });
  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
  });
});

describe("recovery keys", () => {
  it("are random, formatted and hash consistently", () => {
    const k = generateRecoveryKey();
    expect(k).toMatch(/^([A-Z0-9]{4}-){4}[A-Z0-9]{4}$/);
    expect(k).not.toBe(generateRecoveryKey());
    expect(hashRecoveryKey(k)).toBe(hashRecoveryKey(k.toLowerCase().replaceAll("-", " ")));
  });
  it("compares in constant time helper", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
