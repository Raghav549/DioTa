import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hmac } from "@/lib/crypto";

/**
 * Best-effort client IP. On Vercel, `x-real-ip` / `x-vercel-forwarded-for` are set by the
 * edge and cannot be spoofed by the client; `x-forwarded-for` is only used as a fallback
 * (local / other proxies), where its first hop is client-controlled.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const ip =
      h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip")?.trim() ||
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    return ip.slice(0, 64);
  } catch {
    return "unknown";
  }
}

export async function ipFingerprint(): Promise<string> {
  return hmac("ip", await clientIp());
}

/** Fixed-window limiter backed by the database so it works across serverless instances. Returns true when allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const k = key.slice(0, 200);
  const res = await db.execute(sql`
    insert into rate_limits (key, count, reset_at)
    values (${k}, 1, now() + (${windowSec} * interval '1 second'))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
    returning count
  `);
  // Occasionally purge expired windows so the table cannot grow without bound.
  if (Math.random() < 0.01) {
    await db.execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`).catch(() => undefined);
  }
  const count = Number((res.rows[0] as { count: number }).count);
  return count <= max;
}
