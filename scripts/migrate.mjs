/**
 * Applies the SQL migrations in ./drizzle to DATABASE_URL.
 *
 *   npm run db:migrate            # run manually
 *   (runs automatically during `vercel-build` when DATABASE_URL is available)
 *
 * Behaviour:
 *  - No DATABASE_URL  -> prints a warning and exits 0 (the build must still succeed).
 *  - SKIP_DB_MIGRATIONS=1 -> skipped.
 *  - Migration error  -> exits 1, so a deployment never goes live against a wrong schema.
 *  - A Postgres advisory lock prevents two concurrent builds from migrating at once.
 */
import dotenv from "dotenv";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

dotenv.config({ quiet: true });

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (process.env.SKIP_DB_MIGRATIONS === "1") {
  console.log("[migrate] SKIP_DB_MIGRATIONS=1, skipping.");
  process.exit(0);
}
if (!url) {
  console.warn("[migrate] DATABASE_URL is not set at build time; skipping migrations.");
  console.warn("[migrate] Set DATABASE_URL for the Production (and Preview) environment, then redeploy or run `npm run db:migrate`.");
  process.exit(0);
}

function sslFor(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    /* ignore */
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  if (mode === "disable" || (local && mode === "")) return undefined;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

let connectionString = url;
try {
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  connectionString = u.toString();
} catch {
  /* leave as-is */
}

const client = new pg.Client({ connectionString, ssl: sslFor(url), connectionTimeoutMillis: 15_000 });
const LOCK = 727_001; // arbitrary app-wide advisory lock id

try {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => {});
  }
  console.log("[migrate] Database schema is up to date.");
  await client.end();
} catch (err) {
  console.error("[migrate] Failed:", err instanceof Error ? err.message : err);
  await client.end().catch(() => {});
  process.exit(1);
}
