import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { authRoute } from "@/lib/api";

export const GET = authRoute(async ({ user }) => {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return {
    unread: rows.filter((r) => !r.read).length,
    items: rows.map((r) => ({ id: r.id, type: r.type, params: r.params, read: r.read, createdAt: r.createdAt.toISOString() })),
  };
});

export const POST = authRoute(async ({ user }) => {
  await db.update(notifications).set({ read: true }).where(eq(notifications.userId, user.id));
  return { ok: true };
});
