import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/**
 * The database connection is created lazily, on first use.
 *
 * Importing this module must never throw: `next build` imports every route module while
 * collecting page data, and the build environment does not need (and often does not have)
 * a DATABASE_URL. A missing URL is reported when a request actually needs the database.
 */

type Db = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __dioTaPool?: Pool;
  __dioTaDb?: Db;
};

function sslConfig(url: string): PoolConfig["ssl"] {
  // Local development databases normally run without TLS.
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  if (mode === "disable" || (local && mode === "")) return undefined;
  // `no-verify` exists only for providers whose certificate chain Node cannot validate.
  if (mode === "no-verify") return { rejectUnauthorized: false };
  // Default for every remote database: TLS with full certificate verification.
  return { rejectUnauthorized: true };
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add it in your hosting provider's environment variables.");
  }
  // Strip sslmode from the URL so our explicit `ssl` option is the single source of truth.
  let connectionString = url;
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    connectionString = u.toString();
  } catch {
    /* leave as-is; pg will report a malformed URL */
  }
  const serverless = !!process.env.VERCEL;
  const pool = new Pool({
    connectionString,
    ssl: sslConfig(url),
    // Serverless functions run many small instances: keep each pool small.
    max: Number(process.env.DATABASE_POOL_MAX ?? (serverless ? 3 : 10)),
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Stop runaway queries from holding connections forever.
    statement_timeout: 15_000,
    query_timeout: 20_000,
  });
  // An idle client erroring (e.g. the DB restarted) must not crash the process.
  pool.on("error", (err) => console.error("postgres pool error", err.message));
  return pool;
}

export function getPool(): Pool {
  return (globalForDb.__dioTaPool ??= createPool());
}

export function getDb(): Db {
  return (globalForDb.__dioTaDb ??= drizzle(getPool()));
}

/**
 * `db` keeps the existing `db.select()...` call sites working while deferring the
 * connection until a property is actually accessed at request time.
 */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});
