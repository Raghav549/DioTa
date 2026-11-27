import crypto from "node:crypto";

/**
 * Server configuration checks. Pure (no Next.js imports) so it can be unit-tested.
 * Never returns secret values, only whether each setting is usable.
 */

/** Accepts the key as base64 (`openssl rand -base64 32`) or hex (`openssl rand -hex 32`). */
export function parseEncryptionKey(raw: string | undefined): { key: Buffer } | { error: string } {
  // Tolerate the most common copy/paste mistakes: whitespace, surrounding quotes, a pasted "KEY=" prefix.
  const v = (raw ?? "")
    .trim()
    .replace(/^DATA_ENCRYPTION_KEY\s*=\s*/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!v) return { error: "DATA_ENCRYPTION_KEY is not set" };
  if (/^[0-9a-fA-F]{64}$/.test(v)) return { key: Buffer.from(v, "hex") };
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) {
    const b = Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (b.length === 32) return { key: b };
  }
  return { error: "DATA_ENCRYPTION_KEY is invalid: it must be 32 random bytes (44-character base64 or 64-character hex)" };
}

export const databaseUrl = () => process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

/**
 * The DATA_ENCRYPTION_KEY as a 32-byte key, or null when it is not set (the app then uses its
 * auto-generated database key). A value that is set but not in the strict format (e.g. a long
 * passphrase) is accepted by hashing it, so a formatting mistake never blocks sign-up.
 * Values shorter than 16 characters are too weak and are ignored (reported in /api/health).
 */
export function envEncryptionKey(): Buffer | null {
  const raw = process.env.DATA_ENCRYPTION_KEY;
  const parsed = parseEncryptionKey(raw);
  if ("key" in parsed) return parsed.key;
  const v = (raw ?? "").trim();
  if (v.length >= 16) return crypto.createHash("sha256").update(`dioTa-env-key:${v}`).digest();
  return null;
}

/** Problems that make the app unusable. Empty array = configuration OK. */
export function configProblems(): string[] {
  return databaseUrl() ? [] : ["DATABASE_URL is not set"];
}

/** Non-blocking recommendations shown in /api/health. */
export function configWarnings(): string[] {
  const raw = (process.env.DATA_ENCRYPTION_KEY ?? "").trim();
  const strict = "key" in parseEncryptionKey(raw);
  if (!raw)
    return ["DATA_ENCRYPTION_KEY is not set: the app is using an auto-generated key stored in the database. Add DATA_ENCRYPTION_KEY for stronger protection (see DEPLOY.md)."];
  if (raw.length < 16) return ["DATA_ENCRYPTION_KEY is too short and is being ignored: use a 44-character base64 value (see DEPLOY.md)."];
  if (!strict) return ["DATA_ENCRYPTION_KEY is not a 44-character base64 value; it is being accepted by hashing it."];
  return [];
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Server is not configured: ${problems.join("; ")}`);
  }
}
