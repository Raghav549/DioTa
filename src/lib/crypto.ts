import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/* ---------- master key ---------- */
let master: Buffer | null = null;

/**
 * Production (and any serverless host) MUST provide DATA_ENCRYPTION_KEY.
 * Serverless filesystems are read-only and per-instance, so a generated key file would
 * differ between instances and make encrypted data unreadable. The file fallback exists
 * only for local development.
 */
function masterKey(): Buffer {
  if (master) return master;
  const env = process.env.DATA_ENCRYPTION_KEY?.trim();
  if (env) {
    const b = Buffer.from(env, "base64");
    if (b.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must be 32 random bytes, base64 encoded");
    master = b;
    return b;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("DATA_ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  }
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "master.key");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" });
  } catch {
    /* already exists */
  }
  const key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
  if (key.length !== 32) throw new Error(".data/master.key is corrupt");
  master = key;
  return master;
}

/** Each user gets their own key derived from the master key (HKDF-SHA256). */
function userKey(userId: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", masterKey(), Buffer.alloc(0), `dioTa:user:${userId}`, 32));
}

const b64 = (b: Buffer) => b.toString("base64url");

/** AES-256-GCM, authenticated and bound to the owning user id. */
export function encrypt(userId: string, plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", userKey(userId), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${b64(iv)}.${b64(c.getAuthTag())}.${b64(ct)}`;
}

export function decrypt(userId: string, payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad payload");
  const d = crypto.createDecipheriv("aes-256-gcm", userKey(userId), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/* ---------- hashing helpers ---------- */
export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Keyed hash used for pseudonymous identifiers (IP addresses, partner references). */
export const hmac = (purpose: string, v: string) =>
  crypto.createHmac("sha256", masterKey()).update(`${purpose}:${v}`).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/* ---------- passwords: scrypt (memory-hard, built into Node) ---------- */
const scrypt = promisify(crypto.scrypt) as (
  pw: string,
  salt: Buffer,
  keylen: number,
  opts: crypto.ScryptOptions,
) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 1;
const OPTS = { N, r: R, p: P, maxmem: 128 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw.normalize("NFKC"), salt, 64, OPTS);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  // Refuse absurd cost parameters so a corrupted hash cannot exhaust CPU/memory.
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || n > 2 ** 17 || r > 16 || p > 4) return false;
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length < 16 || expected.length < 32) return false;
  try {
    const key = await scrypt(pw.normalize("NFKC"), salt, expected.length, { N: n, r, p, maxmem: 256 * 1024 * 1024 });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** A throwaway hash so login takes the same time for unknown accounts. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword("dioTa-dummy-password-1!"));

/* ---------- recovery key (100 bits of randomness) ---------- */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function generateRecoveryKey(): string {
  const bytes = crypto.randomBytes(20);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s.match(/.{4}/g)!.join("-");
}
export const normalizeRecoveryKey = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryKey = (k: string) => hmac("recovery", normalizeRecoveryKey(k));
