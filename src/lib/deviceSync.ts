"use client";
import { api, whenIdle } from "@/lib/client";
import { APPS, isCatalogSlug, isPackageSlug } from "@/lib/catalog";
import { Phone, isNative, type PhoneApp } from "@/lib/native";

type TrackedApp = { slug: string; packageName: string | null; logo: string | null };
export type SyncResult = { added: number; updated: number; alerts: { app: string; perm: string }[]; paused?: boolean };

const catalogPkg = new Map<string, string>(APPS.map((a) => [a.slug, a.pkg]));
const CHUNK = 25;

/** Android package of a tracked app (stored, catalog, or the slug itself). */
export function packageOf(a: { slug: string; packageName?: string | null }) {
  return a.packageName ?? catalogPkg.get(a.slug) ?? (isPackageSlug(a.slug) ? a.slug : null);
}

/**
 * Reads REAL data from this phone for the tracked apps (granted permissions, 30-day traffic,
 * last use, firewall state) and sends it to the server. `track` adds new apps from the phone.
 */
export async function syncPhone(track: PhoneApp[] = []): Promise<SyncResult> {
  const total: SyncResult = { added: 0, updated: 0, alerts: [] };
  if (!isNative()) return total;
  const { apps: tracked } = await api<{ apps: TrackedApp[] }>("/api/apps");
  const needIcon = new Set<string>();
  const pkgs = new Set<string>();
  for (const a of tracked) {
    const p = packageOf(a);
    if (!p) continue;
    pkgs.add(p);
    if (!a.logo && !isCatalogSlug(a.slug)) needIcon.add(p);
  }
  const trackSet = new Set(track.map((a) => a.pkg));
  for (const p of trackSet) pkgs.add(p);
  if (!pkgs.size) return total;

  const [{ apps: phoneApps }, fw] = await Promise.all([Phone.listApps({ packages: [...pkgs], icons: needIcon.size > 0 }), Phone.firewall()]);
  const fromScan = new Map(track.map((a) => [a.pkg, a]));
  const blocked = new Set(fw.packages);
  const payload = phoneApps.map((a) => {
    const icon = a.icon ?? fromScan.get(a.pkg)?.icon;
    const isCat = APPS.some((c) => c.pkg === a.pkg);
    return {
      pkg: a.pkg,
      label: (a.label.trim() || a.pkg).slice(0, 80),
      granted: a.granted.filter((g) => g.length <= 120).slice(0, 300),
      dataBytes: a.dataBytes,
      lastUsed: a.lastUsed,
      blocked: blocked.has(a.pkg),
      blockedAttempts: fw.attempts[a.pkg] ?? 0,
      ...(!isCat && icon && (needIcon.has(a.pkg) || trackSet.has(a.pkg)) && icon.length < 40_000 ? { icon } : {}),
    };
  });
  for (let i = 0; i < payload.length; i += CHUNK) {
    const part = payload.slice(i, i + CHUNK);
    if (i) await whenIdle();
    const r = await api<SyncResult>("/api/device/sync", {
      body: { apps: part, track: part.filter((a) => trackSet.has(a.pkg)).map((a) => a.pkg) },
    });
    total.added += r.added;
    total.updated += r.updated;
    total.alerts.push(...r.alerts);
    if (r.paused) {
      total.paused = true; // storage full: tracking stays paused until space is freed / upgraded
      break;
    }
  }
  return total;
}

const KEY = "dt_last_sync";
/**
 * Background sync when the app opens or comes back to the foreground (at most every 5 minutes). It
 * waits until the screen is idle and the user is not tapping, so it never slows down navigation.
 */
export async function autoSync(onAlerts?: (a: SyncResult["alerts"]) => void) {
  if (!isNative()) return;
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 5 * 60_000) return;
  sessionStorage.setItem(KEY, String(Date.now()));
  await new Promise((r) => setTimeout(r, 2500));
  await whenIdle();
  try {
    const r = await syncPhone();
    if (r.alerts.length && onAlerts) onAlerts(r.alerts);
  } catch {
    /* offline or not signed in: try again next time */
  }
}
