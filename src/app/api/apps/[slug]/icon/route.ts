import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredApps } from "@/db/schema";
import { ApiError, authRoute } from "@/lib/api";
import { isPackageSlug } from "@/lib/catalog";

/** The real app icon taken from the user's phone (only for apps outside the built-in catalog). */
export const GET = authRoute<{ slug: string }>(async ({ user, params }) => {
  if (!isPackageSlug(params.slug)) throw new ApiError("not_found", 404);
  const [a] = await db
    .select({ icon: monitoredApps.icon })
    .from(monitoredApps)
    .where(and(eq(monitoredApps.userId, user.id), eq(monitoredApps.slug, params.slug)))
    .limit(1);
  const m = a?.icon?.match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new ApiError("not_found", 404);
  return new NextResponse(Buffer.from(m[1], "base64"), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
});
