import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { vaultCategories, vaultItems } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { CATEGORIES } from "@/lib/catalog";

export const GET = authRoute(async ({ user }) => {
  const [stats, modes] = await Promise.all([
    db
      .select({
        category: vaultItems.category,
        items: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${vaultItems.size}),0)::int`,
        updatedAt: sql<string | null>`max(${vaultItems.updatedAt})`,
      })
      .from(vaultItems)
      .where(eq(vaultItems.userId, user.id))
      .groupBy(vaultItems.category),
    db.select().from(vaultCategories).where(eq(vaultCategories.userId, user.id)),
  ]);
  return {
    categories: CATEGORIES.map((c) => {
      const s = stats.find((x) => x.category === c);
      return {
        category: c,
        items: s?.items ?? 0,
        bytes: s?.bytes ?? 0,
        updatedAt: s?.updatedAt ? new Date(s.updatedAt).toISOString() : null,
        mode: modes.find((m) => m.category === c)?.mode ?? "private",
      };
    }),
  };
});
