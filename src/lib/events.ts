import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, notifications, privacyEvents, users } from "@/db/schema";
import { ipFingerprint } from "@/lib/security";

/** A user-visible privacy event (shown in the activity timeline). */
export async function recordEvent(userId: string, type: string, params: Record<string, string> = {}, appSlug?: string) {
  await db.insert(privacyEvents).values({ userId, type, params, appSlug: appSlug ?? null });
}

/** A security audit trail entry (never shown with raw details to users). */
export async function audit(userId: string | null, action: string, meta: Record<string, unknown> = {}) {
  await db.insert(auditLogs).values({ userId, action, meta, ipHash: await ipFingerprint() });
}

type Pref = "alerts" | "activity" | "rewards" | "security";
export async function notify(userId: string, type: string, pref: Pref, params: Record<string, string> = {}) {
  const [u] = await db.select({ p: users.notifPrefs }).from(users).where(eq(users.id, userId)).limit(1);
  if (u && u.p[pref] === false) return;
  await db.insert(notifications).values({ userId, type, params });
}
