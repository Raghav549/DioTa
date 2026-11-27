import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredApps } from "@/db/schema";
import { authRoute, readBody } from "@/lib/api";
import { mapAndroidPermissions } from "@/lib/android";
import { SENSITIVE, catalogByPkg } from "@/lib/catalog";
import { audit, notify, recordEvent } from "@/lib/events";
import { storageState } from "@/lib/storage";
import { deviceSyncSchema } from "@/lib/validation";

/**
 * Real data from the DioTa Android app.
 * The phone reads, for each app: the permissions it has actually been granted, its mobile + Wi-Fi
 * traffic (last 30 days), when it was last used, and whether the on-device firewall blocks it.
 * Apps the user is tracking are updated, apps in `track` are added. Permission changes become
 * privacy events, and new sensitive permissions raise an alert.
 */
export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, deviceSyncSchema, 1_500_000);
    // Storage full: tracking is paused until space is freed or storage is upgraded.
    if ((await storageState(user)).full) return { added: 0, updated: 0, alerts: [], paused: true };
    const track = new Set(b.track ?? []);
    const rows = await db.select().from(monitoredApps).where(eq(monitoredApps.userId, user.id));
    const byPkg = new Map(rows.filter((r) => r.packageName).map((r) => [r.packageName!, r]));
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const now = new Date();
    let added = 0;
    let updated = 0;
    const alerts: { app: string; perm: string }[] = []; // shown as Android notifications by the app

    for (const app of b.apps) {
      const cat = catalogByPkg(app.pkg);
      const slug = cat?.slug ?? app.pkg;
      const name = cat?.name ?? app.label;
      const perms = mapAndroidPermissions(app.granted);
      const measured = {
        packageName: app.pkg,
        source: "device" as const,
        permissions: perms,
        lastObservedAt: now,
        ...(app.dataBytes !== undefined ? { dataBytes: app.dataBytes } : {}),
        ...(app.lastUsed !== undefined ? { lastUsedAt: app.lastUsed ? new Date(app.lastUsed) : null } : {}),
        ...(app.blocked !== undefined ? { blocked: app.blocked } : {}),
        ...(app.blockedAttempts !== undefined ? { blockedAttempts: app.blockedAttempts } : {}),
        ...(!cat ? { name: app.label, ...(app.icon ? { icon: app.icon } : {}) } : {}),
      };
      const row = byPkg.get(app.pkg) ?? bySlug.get(slug);

      if (!row) {
        if (!track.has(app.pkg)) continue; // only apps the user chose to track are stored
        await db.insert(monitoredApps).values({ userId: user.id, slug, addedAt: now, ...measured }).onConflictDoNothing();
        await recordEvent(user.id, "app_added", { app: name }, slug);
        const risky = perms.find((p) => SENSITIVE.includes(p));
        if (risky) {
          await notify(user.id, "alert", "alerts", { app: name, perm: risky });
          alerts.push({ app: name, perm: risky });
        }
        added++;
        continue;
      }

      const before = row.source === "device" ? row.permissions : null; // first sync replaces hand-entered values
      if (before) {
        for (const p of perms.filter((p) => !before.includes(p))) {
          await recordEvent(user.id, "perm_granted", { app: name, perm: p }, row.slug);
          if (SENSITIVE.includes(p) && row.monitoring) {
            await notify(user.id, "alert", "alerts", { app: name, perm: p });
            alerts.push({ app: name, perm: p });
          }
        }
        for (const p of before.filter((p) => !perms.includes(p as never)))
          await recordEvent(user.id, "perm_revoked", { app: name, perm: p }, row.slug);
      }
      await db.update(monitoredApps).set(measured).where(eq(monitoredApps.id, row.id));
      updated++;
    }
    if (added) await audit(user.id, "device_apps_added", { count: added });
    return { added, updated, alerts: user.notifPrefs.alerts ? alerts : [] };
  },
  { rate: { name: "device_sync", max: 240, windowSec: 3600 } },
);

export const dynamic = "force-dynamic";
