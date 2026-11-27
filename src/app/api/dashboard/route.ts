import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredApps, privacyEvents, vaultItems } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { SENSITIVE } from "@/lib/catalog";
import { walletSummary } from "@/lib/wallet";

export const GET = authRoute(async ({ user }) => {
  const uid = user.id;
  const since = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  const [apps, recent, week, [stored], [evCount], w] = await Promise.all([
    db.select().from(monitoredApps).where(eq(monitoredApps.userId, uid)),
    db.select().from(privacyEvents).where(eq(privacyEvents.userId, uid)).orderBy(desc(privacyEvents.createdAt)).limit(6),
    db
      .select({ createdAt: privacyEvents.createdAt })
      .from(privacyEvents)
      .where(and(eq(privacyEvents.userId, uid), gte(privacyEvents.createdAt, since)))
      .limit(1000),
    db
      .select({ bytes: sql<number>`coalesce(sum(${vaultItems.size}), 0)::int`, items: sql<number>`count(*)::int` })
      .from(vaultItems)
      .where(eq(vaultItems.userId, uid)),
    db.select({ n: sql<number>`count(*)::int` }).from(privacyEvents).where(eq(privacyEvents.userId, uid)),
    walletSummary(uid),
  ]);
  const monitored = apps.filter((a) => a.monitoring);
  const alerts = monitored.filter((a) => a.permissions.some((p) => SENSITIVE.includes(p))).length;
  const status = !user.protectionEnabled ? "off" : !user.monitoringEnabled || alerts > 0 ? "partial" : "protected";
  return {
    name: user.name,
    status,
    protectionEnabled: user.protectionEnabled,
    monitoringEnabled: user.monitoringEnabled,
    appsMonitored: monitored.length,
    appsTotal: apps.length,
    alerts,
    eventsTotal: evCount.n,
    eventTimes: week.map((e) => e.createdAt.toISOString()),
    dataBytes: stored.bytes,
    dataItems: stored.items,
    wallet: { month: w.month, available: w.available, pending: w.pending, lifetime: w.lifetime },
    recentTx: w.transactions.slice(0, 4),
    recentEvents: recent.map((e) => ({ id: e.id, type: e.type, params: e.params, appSlug: e.appSlug, createdAt: e.createdAt.toISOString() })),
  };
});
