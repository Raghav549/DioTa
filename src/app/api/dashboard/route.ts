import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { intercepts, monitoredApps, privacyEvents, vaultItems } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { SENSITIVE } from "@/lib/catalog";
import { walletSummary } from "@/lib/wallet";
import { publicApp } from "@/lib/apps";
import { interceptEvent, listIntercepts } from "@/lib/intercepts";

export const GET = authRoute(async ({ user }) => {
  const uid = user.id;
  const since = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  const [apps, recent, week, [stored], [evCount], w, caught, [blockedTotal]] = await Promise.all([
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
    listIntercepts(uid, { limit: 6 }),
    // Whole-app blocks are already in each app's blockedAttempts (counted on the phone), so only trackers here.
    db
      .select({ n: sql<number>`coalesce(sum(${intercepts.count}), 0)::int` })
      .from(intercepts)
      .where(and(eq(intercepts.userId, uid), ne(intercepts.kind, "app"))),
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
    /** True once the Android app has synced real data from this user's phone. */
    deviceConnected: apps.some((a) => a.source === "device"),
    blockedApps: apps.filter((a) => a.blocked).length,
    /** Whole-app firewall attempts (counted on the phone) plus tracker attempts stopped by the shield. */
    blockedAttempts: apps.reduce((n, a) => n + (a.blockedAttempts ?? 0), 0) + (blockedTotal?.n ?? 0),
    appsTotal: apps.length,
    alerts,
    eventsTotal: evCount.n,
    eventTimes: week.map((e) => e.createdAt.toISOString()),
    dataBytes: stored.bytes,
    dataItems: stored.items,
    wallet: { month: w.month, available: w.available, pending: w.pending, lifetime: w.lifetime },
    recentTx: w.transactions.slice(0, 4),
    logos: apps.slice(0, 3).map((a) => ({ slug: a.slug, logo: publicApp(a).logo, name: publicApp(a).name })),
    recentEvents: [
      ...recent.map((e) => ({ id: e.id, type: e.type, params: e.params, appSlug: e.appSlug, createdAt: e.createdAt.toISOString() })),
      ...caught.map(interceptEvent),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6),
  };
});
