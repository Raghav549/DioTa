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
  it("refuses hashes with abusive cost parameters (DoS guard)", async () => {
    const salt = Buffer.alloc(16, 1).toString("base64");
    const key = Buffer.alloc(64, 2).toString("base64");
    expect(await verifyPassword("x", `scrypt$1073741824$8$1$${salt}$${key}`)).toBe(false);
    expect(await verifyPassword("x", `scrypt$abc$8$1$${salt}$${key}`)).toBe(false);
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

describe("key ring (auto DB key + optional env key)", () => {
  const U = "33333333-3333-3333-3333-333333333333";
  it("data written with the auto key stays readable after DATA_ENCRYPTION_KEY is added", async () => {
    const { registerDbKey } = await import("@/lib/crypto");
    const crypto = await import("node:crypto");
    registerDbKey(crypto.randomBytes(32));
    const saved = process.env.DATA_ENCRYPTION_KEY;
    delete process.env.DATA_ENCRYPTION_KEY;
    const old = encrypt(U, "before env key");
    expect(old.startsWith("v2.")).toBe(true);
    process.env.DATA_ENCRYPTION_KEY = saved;
    const fresh = encrypt(U, "after env key");
    expect(fresh.startsWith("v1.")).toBe(true);
    expect(decrypt(U, old)).toBe("before env key");
    expect(decrypt(U, fresh)).toBe("after env key");
  });
  it("recovery-key hashes stay stable when the env key changes", () => {
    const k = generateRecoveryKey();
    const h1 = hashRecoveryKey(k);
    const saved = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(hashRecoveryKey(k)).toBe(h1);
    process.env.DATA_ENCRYPTION_KEY = saved;
  });
  it("recovery keys hashed with only the env key (older deployments) still verify", async () => {
    const { recoveryKeyCandidates } = await import("@/lib/crypto");
    const nodeCrypto = await import("node:crypto");
    const { envEncryptionKey } = await import("@/lib/config");
    const k = generateRecoveryKey();
    const legacy = nodeCrypto.createHmac("sha256", envEncryptionKey()!).update(`recovery:${k.replace(/-/g, "")}`).digest("hex");
    const c = recoveryKeyCandidates(k.toLowerCase());
    expect(c[0]).toBe(hashRecoveryKey(k));
    expect(c).toContain(legacy);
  });
  it("recovery keys use the expected alphabet and shape", () => {
    for (let i = 0; i < 50; i++) expect(generateRecoveryKey()).toMatch(/^([ABCDEFGHJKMNPQRSTVWXYZ2-9]{4}-){4}[ABCDEFGHJKMNPQRSTVWXYZ2-9]{4}$/);
  });
});
