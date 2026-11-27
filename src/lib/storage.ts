import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Storage quota for the data DioTa keeps for a user: vault entries (manual and auto-filed), blocked
 * attempts, and the profile picture. Free: a warning from 20 MB, capture stops at 50 MB.
 * Upgrade (₹199/month): up to 1 GB.
 */
export const MB = 1024 * 1024;
export const LIMITS = {
  free: { warnAt: 20 * MB, limit: 50 * MB },
  pro: { warnAt: 900 * MB, limit: 1024 * MB },
} as const;
export type Plan = keyof typeof LIMITS;

export type StorageState = { plan: Plan; planUntil: string | null; used: number; warnAt: number; limit: number; warn: boolean; full: boolean };

type PlanUser = { id: string; plan: string; planUntil: Date | null };

/** The plan in force right now (a paid Upgrade lapses at planUntil). */
export function planOf(u: Pick<PlanUser, "plan" | "planUntil">, now = Date.now()): Plan {
  return u.plan === "pro" && u.planUntil && u.planUntil.getTime() > now ? "pro" : "free";
}

export function stateFor(u: Pick<PlanUser, "plan" | "planUntil">, used: number): StorageState {
  const plan = planOf(u);
  const { warnAt, limit } = LIMITS[plan];
  return {
    plan,
    planUntil: plan === "pro" && u.planUntil ? u.planUntil.toISOString() : null,
    used,
    warnAt,
    limit,
    warn: used >= warnAt,
    full: used >= limit,
  };
}

/** Bytes stored for this user, measured from the database itself (always current). */
export async function storageUsed(userId: string): Promise<number> {
  const r = await db.execute(sql`
    select
      (select coalesce(sum(size), 0) from vault_items where user_id = ${userId})
      + (select coalesce(sum(octet_length(detail_enc)), 0) from intercepts where user_id = ${userId})
      + (select coalesce(sum(octet_length(data)), 0) from user_avatars where user_id = ${userId})
      as used`);
  return Number((r.rows[0] as { used: string | number } | undefined)?.used ?? 0);
}

export async function storageState(u: PlanUser): Promise<StorageState> {
  return stateFor(u, await storageUsed(u.id));
}
