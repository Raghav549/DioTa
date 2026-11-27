import type { NextConfig } from "next";

// Baseline headers for every response, including static assets that the proxy (src/proxy.ts)
// skips. The proxy adds the per-request nonce-based Content-Security-Policy on top.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Never ship source maps of server/client code to the public.
  productionBrowserSourceMaps: false,
  // `pg` uses optional native bindings; keep it out of the server bundle.
  serverExternalPackages: ["pg"],
  // Ship the SQL migrations with every server function so the schema can self-heal at runtime.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*", "./src/lib/data/privacy-shield.js"] },
  experimental: {
    // Tabs are client-rendered (their data comes from /api/* in the browser), so a screen that was
    // opened or prefetched can be shown again straight from the in-memory router cache. Without this
    // every tap waited for a server round trip before anything changed on screen.
    staleTimes: { dynamic: 300, static: 300 },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
