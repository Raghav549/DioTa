import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { privacyEvents } from "@/db/schema";
import { authRoute } from "@/lib/api";

export const GET = authRoute(async ({ user }) => {
  const rows = await db
    .select()
    .from(privacyEvents)
    .where(eq(privacyEvents.userId, user.id))
    .orderBy(desc(privacyEvents.createdAt))
    .limit(100);
  return {
    events: rows.map((e) => ({ id: e.id, type: e.type, params: e.params, appSlug: e.appSlug, createdAt: e.createdAt.toISOString() })),
  };
});
