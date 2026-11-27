import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hmac } from "@/lib/crypto";

export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

export async function ipFingerprint(): Promise<string> {
  return hmac("ip", await clientIp());
}

/** Fixed-window limiter backed by the database so it works across instances. Returns true when allowed. */
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const res = await db.execute(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + (${windowSec} * interval '1 second'))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
    returning count
  `);
  const count = Number((res.rows[0] as { count: number }).count);
  return count <= max;
}
