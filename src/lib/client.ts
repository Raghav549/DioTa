"use client";
import { useCallback, useEffect, useState } from "react";

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

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(true);
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
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load };
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
