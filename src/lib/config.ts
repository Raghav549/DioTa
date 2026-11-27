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

const isHosted = () => process.env.NODE_ENV === "production" || !!process.env.VERCEL;

/** Problems that make the app unusable. Empty array = configuration OK. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (!databaseUrl()) problems.push("DATABASE_URL is not set");
  const k = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY);
  // Locally a key file is generated automatically, so only an *invalid* key is a problem there.
  if ("error" in k && (isHosted() || process.env.DATA_ENCRYPTION_KEY)) problems.push(k.error);
  return problems;
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(`Server is not configured: ${problems.join("; ")}`);
  }
}
