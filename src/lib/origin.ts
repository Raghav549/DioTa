import type { NextRequest } from "next/server";

/**
 * The public origin of the app, used to build OAuth redirect URIs and redirects.
 *
 * Order of trust:
 *  1. APP_URL (explicitly configured canonical URL, e.g. https://dioTa.example.com)
 *  2. On Vercel, the production domain Vercel injects (VERCEL_PROJECT_PRODUCTION_URL)
 *     for production deployments, otherwise the deployment URL (VERCEL_URL)
 *  3. Request headers (local development only)
 *
 * Never trusting Host / X-Forwarded-Host in production prevents host-header injection
 * from steering OAuth redirects or post-login redirects to another domain.
 */
export function configuredOrigin(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      throw new Error("APP_URL must be an absolute URL such as https://example.com");
    }
  }
  if (process.env.VERCEL) {
    const host =
      process.env.VERCEL_ENV === "production"
        ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
        : process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  return null;
}

export function originOf(req: NextRequest): string {
  const fixed = configuredOrigin();
  if (fixed) return fixed;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (local ? "http" : "https");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}

export const isSecureOrigin = (origin: string) => origin.startsWith("https://");
