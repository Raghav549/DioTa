import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEncryptionKey } from "@/lib/config";

const raw = crypto.randomBytes(32);

describe("DATA_ENCRYPTION_KEY parsing", () => {
  it("accepts base64 (openssl rand -base64 32)", () => {
    const r = parseEncryptionKey(raw.toString("base64"));
    expect("key" in r && r.key.equals(raw)).toBe(true);
  });
  it("accepts hex (openssl rand -hex 32)", () => {
    const r = parseEncryptionKey(raw.toString("hex"));
    expect("key" in r && r.key.equals(raw)).toBe(true);
  });
  it("tolerates whitespace, quotes and a pasted NAME= prefix", () => {
    const r = parseEncryptionKey(`  DATA_ENCRYPTION_KEY="${raw.toString("base64")}"\n`);
    expect("key" in r && r.key.equals(raw)).toBe(true);
  });
  it("rejects missing, short or passphrase-style keys", () => {
    expect("error" in parseEncryptionKey(undefined)).toBe(true);
    expect("error" in parseEncryptionKey("")).toBe(true);
    expect("error" in parseEncryptionKey("my-secret-password")).toBe(true);
    expect("error" in parseEncryptionKey(crypto.randomBytes(16).toString("base64"))).toBe(true);
  });
});

describe("lenient env key", () => {
  it("accepts a long passphrase by hashing it, ignores short values", async () => {
    const { envEncryptionKey } = await import("@/lib/config");
    const saved = process.env.DATA_ENCRYPTION_KEY;
    process.env.DATA_ENCRYPTION_KEY = "a long passphrase someone typed";
    expect(envEncryptionKey()?.length).toBe(32);
    process.env.DATA_ENCRYPTION_KEY = "short";
    expect(envEncryptionKey()).toBeNull();
    process.env.DATA_ENCRYPTION_KEY = saved;
  });
});
