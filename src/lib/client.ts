"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiErr extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}

export async function api<T = { ok: true }>(url: string, opts: { method?: string; body?: unknown; noRedirect?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", "x-dt-csrf": "1" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiErr("network", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !opts.noRedirect && !url.startsWith("/api/auth/") && typeof window !== "undefined") window.location.href = "/login";
    throw new ApiErr((data as { error?: string }).error ?? "generic", res.status);
  }
  return data as T;
}

/**
 * Last response per URL for this tab. Screens you've already opened render instantly from it
 * while fresh data loads in the background (stale-while-revalidate). Cleared on sign-out (full reload).
 */
const apiCache = new Map<string, unknown>();
const cacheSubs = new Set<() => void>();
function putCache(url: string, d: unknown) {
  apiCache.set(url, d);
  for (const fn of cacheSubs) fn();
}
export const clearApiCache = () => {
  apiCache.clear();
  for (const fn of cacheSubs) fn();
};
const subCache = (fn: () => void) => {
  cacheSubs.add(fn);
  return () => void cacheSubs.delete(fn);
};

/** Fetch screens' data ahead of time (in idle time), so a tab opened later has it at once. */
export async function prefetchApi(urls: string[]) {
  await Promise.all(urls.filter((u) => !apiCache.has(u)).map((u) => api(u, { noRedirect: true }).then((d) => putCache(u, d), () => {})));
}

export function useApi<T>(url: string | null) {
  // The shared cache is read through a store: while hydrating server HTML it reads as empty (the
  // server had none, so the first render matches it), and every screen using the same URL updates
  // together when fresh data arrives, including tabs kept alive in the background.
  const cachedVal = useSyncExternalStore(
    subCache,
    () => (url ? (apiCache.get(url) as T | undefined) : undefined),
    () => undefined,
  );
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(true);
  const setData = useCallback(
    (d: T) => {
      if (url) putCache(url, d);
      setDataState(d);
    },
    [url],
  );
  const load = useCallback(async () => {
    if (!url) return;
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e as ApiErr);
    } finally {
      setLoading(false);
    }
  }, [url, setData]);
  useEffect(() => {
    if (!url) return;
    let alive = true; // ignore responses that arrive after the URL changed / unmount
    api<T>(url)
      .then(
        (d) => {
          if (!alive) return;
          setData(d);
          setError(null);
        },
        (e) => alive && setError(e as ApiErr),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [url, setData]);
  const fromCache = cachedVal ?? null;
  const value = (fromCache ?? data) as T | null;
  return { data: value, error, loading: loading && !fromCache, reload: load };
}

export function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function haptic(ms = 8) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* unsupported */
  }
}

/* ---------- formatting (all via Intl, so every language is localised) ---------- */
export const money = (paise: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);

export const num = (n: number, locale: string) => new Intl.NumberFormat(locale).format(n);

export const bytes = (n: number, locale: string) => {
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i ? 1 : 0 }).format(v)} ${units[i]}`;
};

export const dateFmt = (iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat(locale, opts).format(new Date(iso));

export function rel(iso: string, locale: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const f = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return f.format(Math.round(diff), "second");
  if (abs < 3600) return f.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return f.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return f.format(Math.round(diff / 86400), "day");
  return dateFmt(iso, locale);
}

/* ---------- background work never competes with a tap ---------- */
let lastInput = 0;
if (typeof window !== "undefined") {
  const mark = () => (lastInput = performance.now());
  window.addEventListener("pointerdown", mark, { capture: true, passive: true });
  window.addEventListener("keydown", mark, { capture: true, passive: true });
}

/**
 * Resolves when the main thread is idle and the user has not touched the screen for a moment, so
 * background work (phone sync, shield, polling) never delays a tap or a screen change.
 */
export function whenIdle(timeoutMs = 4000): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const quiet = performance.now() - lastInput > 450;
      if (quiet || performance.now() - start > timeoutMs * 2) {
        if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: timeoutMs });
        else setTimeout(resolve, 60);
      } else setTimeout(step, 250);
    };
    step();
  });
}
