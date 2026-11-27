import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredApps, privacyEvents } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { appName } from "@/lib/catalog";
import { publicApp } from "@/lib/apps";
import { audit, recordEvent } from "@/lib/events";
import { appAddSchema } from "@/lib/validation";

export const GET = authRoute(async ({ user }) => {
  const [apps, counts] = await Promise.all([
    db.select().from(monitoredApps).where(eq(monitoredApps.userId, user.id)),
    db
      .select({ slug: privacyEvents.appSlug, n: sql<number>`count(*)::int` })
      .from(privacyEvents)
      .where(eq(privacyEvents.userId, user.id))
      .groupBy(privacyEvents.appSlug),
  ]);
  const byApp = new Map(counts.map((c) => [c.slug, c.n]));
  return { apps: apps.map((a) => publicApp(a, byApp.get(a.slug) ?? 0)) };
});

export const POST = authRoute(async ({ req, user }) => {
  const { slug } = await readBody(req, appAddSchema);
  const [existing] = await db.select({ id: monitoredApps.id }).from(monitoredApps).where(
    sql`${monitoredApps.userId} = ${user.id} and ${monitoredApps.slug} = ${slug}`,
  );
  if (existing) throw new ApiError("invalid_input", 409);
  await db.insert(monitoredApps).values({ userId: user.id, slug, lastObservedAt: new Date() });
  await recordEvent(user.id, "app_added", { app: appName(slug) }, slug);
  await audit(user.id, "app_added", { slug });
  return { ok: true };
});
