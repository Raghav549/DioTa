import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { privacyEvents } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { interceptEvent, listIntercepts } from "@/lib/intercepts";

export const GET = authRoute(async ({ user }) => {
  const [rows, caught] = await Promise.all([
    db.select().from(privacyEvents).where(eq(privacyEvents.userId, user.id)).orderBy(desc(privacyEvents.createdAt)).limit(100),
    listIntercepts(user.id, { limit: 100 }),
  ]);
  // Everything in one timeline: your own actions and every attempt DioTa blocked and captured.
  const events = [
    ...rows.map((e) => ({ id: e.id, type: e.type, params: e.params, appSlug: e.appSlug, createdAt: e.createdAt.toISOString() })),
    ...caught.map(interceptEvent),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { events: events.slice(0, 150) };
});
