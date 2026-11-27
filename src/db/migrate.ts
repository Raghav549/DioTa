import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import crypto from "node:crypto";
import { getPool } from "@/db";
import { registerDbKey } from "@/lib/crypto";

/**
 * Makes sure the database schema is up to date, once per server instance.
 *
 * Migrations normally run during `vercel-build`, but if DATABASE_URL was added (or changed)
 * after a build, the tables would be missing and every request would fail. This applies any
 * pending migrations on first use instead. It is idempotent and guarded by an advisory lock.
 * It also loads (creating on first run) the app's fallback encryption key.
 */
const g = globalThis as typeof globalThis & { __dioTaSchema?: Promise<void> };
const LOCK = 727_001; // same id as scripts/migrate.mjs

async function run() {
  const client = await getPool().connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    try {
      await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      // Create the app's own encryption key once (first writer wins), then load it.
      await client.query(
        "insert into app_secrets (name, value) values ('master_key', $1) on conflict (name) do nothing",
        [crypto.randomBytes(32).toString("base64")],
      );
      const { rows } = await client.query<{ value: string }>("select value from app_secrets where name = 'master_key'");
      registerDbKey(Buffer.from(rows[0].value, "base64"));
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

export function ensureSchema(): Promise<void> {
  g.__dioTaSchema ??= run().catch((e) => {
    g.__dioTaSchema = undefined; // retry on the next request
    console.error("[db] schema migration failed:", e instanceof Error ? e.message : e);
    throw e;
  });
  return g.__dioTaSchema;
}
