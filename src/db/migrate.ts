import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { getPool } from "@/db";

/**
 * Makes sure the database schema is up to date, once per server instance.
 *
 * Migrations normally run during `vercel-build`, but if DATABASE_URL was added (or changed)
 * after a build, the tables would be missing and every request would fail. This applies any
 * pending migrations on first use instead. It is idempotent and guarded by an advisory lock.
 */
const g = globalThis as typeof globalThis & { __dioTaSchema?: Promise<void> };
const LOCK = 727_001; // same id as scripts/migrate.mjs

async function run() {
  const client = await getPool().connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    try {
      await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
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
