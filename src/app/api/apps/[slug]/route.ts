import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredApps, privacyEvents } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { SENSITIVE, appName, isAppSlug } from "@/lib/catalog";
import { publicApp } from "@/lib/apps";
import { listIntercepts } from "@/lib/intercepts";
import { audit, notify, recordEvent } from "@/lib/events";
import { appPatchSchema } from "@/lib/validation";

async function load(userId: string, slug: string) {
  if (!isAppSlug(slug)) throw new ApiError("not_found", 404);
  const [a] = await db
    .select()
    .from(monitoredApps)
    .where(and(eq(monitoredApps.userId, userId), eq(monitoredApps.slug, slug)))
    .limit(1);
  if (!a) throw new ApiError("not_found", 404);
  return a;
}

export const GET = authRoute<{ slug: string }>(async ({ user, params }) => {
  const a = await load(user.id, params.slug);
  const [events, caught] = await Promise.all([
    db
      .select()
      .from(privacyEvents)
      .where(and(eq(privacyEvents.userId, user.id), eq(privacyEvents.appSlug, a.slug)))
      .orderBy(desc(privacyEvents.createdAt))
      .limit(50),
    // The app's lifetime record of blocked attempts (newest first).
    listIntercepts(user.id, { app: a.slug, limit: 500 }),
  ]);
  return {
    app: publicApp(a),
    intercepts: caught,
    events: events.map((e) => ({ id: e.id, type: e.type, params: e.params, createdAt: e.createdAt.toISOString() })),
  };
});

export const PATCH = authRoute<{ slug: string }>(async ({ req, user, params }) => {
  const a = await load(user.id, params.slug);
  const b = await readBody(req, appPatchSchema);
  // Permissions of apps synced from the phone are real readings; they can only change on the phone.
  if (b.permissions && a.source === "device") throw new ApiError("invalid_input", 409);
  const name = appName(a.slug, a.name);

  if (b.monitoring !== undefined && b.monitoring !== a.monitoring)
    await recordEvent(user.id, b.monitoring ? "monitoring_on" : "monitoring_off", { app: name }, a.slug);
  if (b.blocked !== undefined && b.blocked !== a.blocked)
    await recordEvent(user.id, b.blocked ? "blocked_on" : "blocked_off", { app: name }, a.slug);
  if (b.allowUse !== undefined && b.allowUse !== a.allowUse)
    await recordEvent(user.id, b.allowUse ? "use_on" : "use_off", { app: name }, a.slug);
  if (b.permissions) {
    for (const p of b.permissions.filter((p) => !a.permissions.includes(p))) {
      await recordEvent(user.id, "perm_granted", { app: name, perm: p }, a.slug);
      if (SENSITIVE.includes(p)) await notify(user.id, "alert", "alerts", { app: name, perm: p });
    }
    for (const p of a.permissions.filter((p) => !b.permissions!.includes(p as never)))
      await recordEvent(user.id, "perm_revoked", { app: name, perm: p }, a.slug);
  }
  await db
    .update(monitoredApps)
    .set({ ...b, lastObservedAt: new Date() })
    .where(and(eq(monitoredApps.id, a.id), eq(monitoredApps.userId, user.id)));
  return { ok: true };
});

export const DELETE = authRoute<{ slug: string }>(async ({ user, params }) => {
  const a = await load(user.id, params.slug);
  await db.delete(monitoredApps).where(and(eq(monitoredApps.id, a.id), eq(monitoredApps.userId, user.id)));
  await recordEvent(user.id, "app_removed", { app: appName(a.slug, a.name) });
  await audit(user.id, "app_removed", { slug: a.slug });
  return { ok: true };
});
