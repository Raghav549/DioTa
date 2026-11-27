import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { configProblems, databaseUrl, parseEncryptionKey } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Setup self-check. Open /api/health in a browser after deploying.
 * Reports only pass/fail per setting. It never reveals secret values.
 */
export async function GET() {
  const checks = {
    databaseUrl: !!databaseUrl(),
    encryptionKey: "key" in parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY),
    databaseConnection: false,
    databaseTables: false,
  };
  const problems = configProblems();
  if (checks.databaseUrl) {
    try {
      await db.execute(sql`select 1`);
      checks.databaseConnection = true;
      await ensureSchema();
      await db.execute(sql`select 1 from users limit 1`);
      checks.databaseTables = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error("[health] database check failed:", msg);
      problems.push(
        checks.databaseConnection
          ? "Database tables could not be created (check that the database user can create tables)"
          : "Cannot connect to the database (check DATABASE_URL; if it is a certificate error set DATABASE_SSL=no-verify)",
      );
    }
  }
  const ok = problems.length === 0;
  return Response.json(
    { ok, checks, ...(ok ? {} : { problems, fix: "Vercel → Project → Settings → Environment Variables, then Deployments → Redeploy" }) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
