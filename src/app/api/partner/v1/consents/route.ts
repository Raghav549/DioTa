import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vaultCategories } from "@/db/schema";
import { hmac, safeEqual, sha256 } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/security";
import { configProblems } from "@/lib/config";
import { ensureSchema } from "@/db/migrate";
import { interceptTotals } from "@/lib/intercepts";

/**
 * Integration-ready endpoint for a future, separately built B2B marketplace.
 * Disabled until PARTNER_API_SECRET is configured. Returns only pseudonymous references
 * and the categories users have explicitly allowed. It never returns personal content.
 *
 * `signals` comes from the vault pipeline: per allowed category, how many tracking attempts DioTa's
 * shield blocked on the user's phone, by kind (ads, analytics, location, ...). Counts only: no app
 * names, domains, times or content.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.PARTNER_API_SECRET;
  const h = { "Cache-Control": "no-store" };
  if (!secret || secret.length < 32) return NextResponse.json({ error: "not_enabled" }, { status: 503, headers: h });
  if (configProblems().length) return NextResponse.json({ error: "server_config" }, { status: 503, headers: h });
  await ensureSchema();
  if (!(await rateLimit(`partner:${await clientIp()}`, 60, 60))) return NextResponse.json({ error: "rate" }, { status: 429, headers: h });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  // Compare fixed-length digests so neither the content nor the length of the secret leaks via timing.
  if (!token || !safeEqual(sha256(token), sha256(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: h });
  const rows = await db.select().from(vaultCategories).where(eq(vaultCategories.mode, "selected"));
  const allowed = new Map<string, Set<string>>();
  for (const r of rows) allowed.set(r.userId, (allowed.get(r.userId) ?? new Set()).add(r.category));
  const totals = await interceptTotals([...allowed.keys()]);
  const signals = new Map<string, Record<string, Record<string, number>>>();
  for (const t of totals) {
    if (!allowed.get(t.userId)?.has(t.category)) continue; // only categories the user shares
    const s = signals.get(t.userId) ?? {};
    (s[t.category] ??= {})[t.kind] = t.n;
    signals.set(t.userId, s);
  }
  return NextResponse.json(
    {
      consents: [...allowed].map(([userId, categories]) => ({
        ref: hmac("partner", userId),
        categories: [...categories],
        signals: signals.get(userId) ?? {},
      })),
    },
    { headers: h },
  );
}
