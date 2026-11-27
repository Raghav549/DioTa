import type { monitoredApps } from "@/db/schema";
import { SENSITIVE, appName, isCatalogSlug } from "@/lib/catalog";

type Row = typeof monitoredApps.$inferSelect;

/** The shape of a tracked app as returned by the API (never includes the icon bytes or user id). */
export function publicApp(a: Row, events = 0) {
  return {
    slug: a.slug,
    name: appName(a.slug, a.name),
    packageName: a.packageName,
    source: a.source as "manual" | "device",
    monitoring: a.monitoring,
    permissions: a.permissions,
    dataCategories: a.dataCategories,
    allowUse: a.allowUse,
    blocked: a.blocked,
    blockedAttempts: a.blockedAttempts,
    dataBytes: a.dataBytes,
    lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
    addedAt: a.addedAt.toISOString(),
    lastObservedAt: a.lastObservedAt?.toISOString() ?? null,
    /** Catalog apps use /logos/<slug>.svg; other apps use their real icon from the phone. */
    logo: isCatalogSlug(a.slug) ? `/logos/${a.slug}.svg` : a.icon ? `/api/apps/${encodeURIComponent(a.slug)}/icon` : null,
    events,
    needsReview: a.permissions.some((p) => SENSITIVE.includes(p)),
  };
}
export type PublicApp = ReturnType<typeof publicApp>;
