import crypto from "node:crypto";
import { promisify } from "node:util";
import { ConfigError, envEncryptionKey } from "@/lib/config";

/* ---------- keys ----------
 *
 * Two possible master keys:
 *  - ENV key: DATA_ENCRYPTION_KEY (recommended). It lives outside the database, so a database
 *    dump alone cannot decrypt vault data.
 *  - DB key: generated automatically on first start and stored in the `app_secrets` table. It
 *    means the app works with only DATABASE_URL configured.
 *
 * Every ciphertext records which key encrypted it ("v1" = env key, "v2" = DB key), so adding
 * DATA_ENCRYPTION_KEY later never makes existing data unreadable. New data then uses the env key.
 * Keyed hashes (recovery keys, IP fingerprints) always use the DB key when it is available, so
 * they stay stable when the env key is added or changed.
 */
const g = globalThis as typeof globalThis & { __dioTaDbKey?: Buffer };

/** Called once per instance after the database is ready (see src/db/migrate.ts). */
export function registerDbKey(key: Buffer) {
  if (key.length !== 32) throw new Error("stored app key is corrupt");
  g.__dioTaDbKey = key;
}

const dbKey = () => g.__dioTaDbKey ?? null;

function noKey(): never {
  throw new ConfigError(["No encryption key available (database not reachable and DATA_ENCRYPTION_KEY not set)"]);
}

function keyFor(version: "v1" | "v2"): Buffer {
  if (version === "v1") return envEncryptionKey() ?? noKey();
  return dbKey() ?? noKey();
}

/** Each user gets their own key derived from the master key (HKDF-SHA256). */
function userKey(master: Buffer, userId: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", master, Buffer.alloc(0), `dioTa:user:${userId}`, 32));
}

const b64 = (b: Buffer) => b.toString("base64url");

/** AES-256-GCM, authenticated and bound to the owning user id. */
export function encrypt(userId: string, plain: string): string {
  const version = envEncryptionKey() ? "v1" : "v2";
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", userKey(keyFor(version), userId), iv);
  c.setAAD(Buffer.from(userId));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${version}.${b64(iv)}.${b64(c.getAuthTag())}.${b64(ct)}`;
}

export function decrypt(userId: string, payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if ((v !== "v1" && v !== "v2") || !iv || !tag || !ct) throw new Error("bad payload");
  const d = crypto.createDecipheriv("aes-256-gcm", userKey(keyFor(v), userId), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(userId));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/* ---------- hashing helpers ---------- */
export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** Keyed hash used for pseudonymous identifiers (IP addresses, partner references). */
export const hmac = (purpose: string, v: string) =>
  crypto
    .createHmac("sha256", dbKey() ?? envEncryptionKey() ?? noKey())
    .update(`${purpose}:${v}`)
    .digest("hex");

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
  // crypto.randomInt is uniform (no modulo bias).
  let s = "";
  for (let i = 0; i < 20; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s.match(/.{4}/g)!.join("-");
}
export const normalizeRecoveryKey = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const hashRecoveryKey = (k: string) => hmac("recovery", normalizeRecoveryKey(k));
/**
 * Every hash a recovery key may have been stored under: the current key first, then the env key.
 * Keeps recovery working for accounts created on a deployment that only had DATA_ENCRYPTION_KEY.
 */
export function recoveryKeyCandidates(k: string): string[] {
  const v = `recovery:${normalizeRecoveryKey(k)}`;
  const keys = [dbKey(), envEncryptionKey()].filter((x): x is Buffer => !!x);
  if (!keys.length) noKey();
  return [...new Set(keys.map((key) => crypto.createHmac("sha256", key).update(v).digest("hex")))];
}
