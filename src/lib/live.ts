"use client";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/client";
import { appName, catalogByPkg, isAppSlug } from "@/lib/catalog";
import { KIND_DATA, type Kind } from "@/lib/trackers";
import type { LiveAttempt } from "@/lib/native";

/** A blocked attempt as the home screen shows it. */
export type Caught = {
  id: string;
  app: string;
  appSlug: string;
  pkg: string;
  domain: string;
  org: string;
  kind: string;
  data: string[];
  trigger: string;
  count: number;
  at: string;
  /** Pushed by the phone this instant (not yet in the account's list). */
  live?: boolean;
};

/**
 * Real-time blocked attempts, shared by the home "Activities" card and "Recent app activity".
 *
 * - In the Android app the phone pushes every attempt the moment it is blocked ("dt:intercepts"),
 *   so it shows instantly; the account's list is only re-read now and then to stay in sync.
 * - On the website (no phone attached) the account's list is re-read every few seconds.
 * Reading stops while nobody shows it or the screen is hidden.
 */
const MAX = 30;
let server: Caught[] | null = null;
let pushed: Caught[] = [];
let snapshot: Caught[] | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = false;

const key = (c: Pick<Caught, "pkg" | "domain">) => `${c.pkg}|${c.domain}`;
const ms = (c: Caught) => Date.parse(c.at) || 0;

function rebuild() {
  if (server === null && !pushed.length) {
    snapshot = null;
  } else {
    // A pushed attempt is dropped once the account's list has it (same app + domain, as new or newer).
    const newest = new Map<string, number>();
    for (const s of server ?? []) newest.set(key(s), Math.max(newest.get(key(s)) ?? 0, ms(s)));
    pushed = pushed.filter((p) => ms(p) > (newest.get(key(p)) ?? 0));
    const merged = [...pushed, ...(server ?? [])].sort((a, b) => ms(b) - ms(a));
    snapshot = merged.slice(0, MAX);
  }
  subs.forEach((f) => f());
}

function fromPhone(a: LiveAttempt): Caught | null {
  if (!a || typeof a.pkg !== "string" || typeof a.domain !== "string") return null;
  const appSlug = catalogByPkg(a.pkg)?.slug ?? a.pkg;
  if (!isAppSlug(appSlug)) return null;
  const kind = (a.app ? "app" : a.kind && a.kind in KIND_DATA ? a.kind : null) as Kind | null;
  if (!kind) return null; // not a known tracker: the account's list will tell what it was
  const at = Number.isFinite(a.at) ? Math.min(a.at, Date.now()) : Date.now();
  return {
    id: `live-${key(a)}-${at}`,
    app: appName(appSlug, a.label),
    appSlug,
    pkg: a.pkg,
    domain: a.domain,
    org: a.org ?? "",
    kind,
    data: [...KIND_DATA[kind]],
    trigger: a.trigger || "unknown",
    count: 1,
    at: new Date(at).toISOString(),
    live: true,
  };
}

function onPush(e: Event) {
  const list = (e as CustomEvent<LiveAttempt[]>).detail;
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const a of list) {
    const c = fromPhone(a);
    if (!c) continue;
    const i = pushed.findIndex((p) => key(p) === key(c));
    if (i >= 0) {
      if (ms(c) <= ms(pushed[i])) continue;
      c.count = pushed[i].count + 1;
      pushed.splice(i, 1);
    }
    pushed.unshift(c);
    changed = true;
  }
  if (!changed) return;
  if (pushed.length > MAX) pushed.length = MAX;
  rebuild();
}

const isApp = () => typeof navigator !== "undefined" && navigator.userAgent.includes(" DioTaAndroid/");

async function refresh() {
  if (inflight || document.visibilityState !== "visible") return;
  inflight = true;
  try {
    const r = await api<{ intercepts: Caught[] }>("/api/intercepts?limit=12", { noRedirect: true });
    server = r.intercepts;
    rebuild();
  } catch {
    if (server === null) {
      server = [];
      rebuild();
    }
  } finally {
    inflight = false;
  }
}

function loop() {
  clearTimeout(timer);
  if (!subs.size) return;
  timer = setTimeout(async () => {
    await refresh();
    loop();
  }, isApp() ? 20_000 : 5_000);
}

function onVisible() {
  if (document.visibilityState !== "visible" || !subs.size) return;
  refresh().then(loop);
}

if (typeof window !== "undefined") {
  window.addEventListener("dt:intercepts", onPush);
  document.addEventListener("visibilitychange", onVisible);
}

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) refresh().then(loop);
  return () => {
    subs.delete(f);
    if (!subs.size) clearTimeout(timer);
  };
}

/** Latest blocked attempts, newest first (null until the first answer). */
export function useCaught(): Caught[] | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => null,
  );
}

/** The account's list changed (e.g. a vault category was cleared): read it again now. */
export function refreshCaught() {
  if (subs.size) refresh();
}
