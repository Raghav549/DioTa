import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vaultCategories } from "@/db/schema";
import { hmac, safeEqual, sha256 } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/security";

/**
 * Integration-ready endpoint for a future, separately built B2B marketplace.
 * Disabled until PARTNER_API_SECRET is configured. Returns only pseudonymous references
 * and the categories users have explicitly allowed. It never returns personal content.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.PARTNER_API_SECRET;
  const h = { "Cache-Control": "no-store" };
  if (!secret || secret.length < 32) return NextResponse.json({ error: "not_enabled" }, { status: 503, headers: h });
  if (!(await rateLimit(`partner:${await clientIp()}`, 60, 60))) return NextResponse.json({ error: "rate" }, { status: 429, headers: h });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  // Compare fixed-length digests so neither the content nor the length of the secret leaks via timing.
  if (!token || !safeEqual(sha256(token), sha256(secret))) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: h });
  const rows = await db.select().from(vaultCategories).where(eq(vaultCategories.mode, "selected"));
  const grouped = new Map<string, string[]>();
  for (const r of rows) {
    const ref = hmac("partner", r.userId);
    grouped.set(ref, [...(grouped.get(ref) ?? []), r.category]);
  }
  return NextResponse.json({ consents: [...grouped].map(([ref, categories]) => ({ ref, categories })) }, { headers: h });
}
