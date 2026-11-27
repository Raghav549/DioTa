import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { audit } from "@/lib/events";

export const GET = authRoute(async ({ user }) => {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, user.id)).orderBy(desc(sessions.lastSeenAt));
  return {
    sessions: rows.map((s) => ({
      id: s.id,
      current: s.id === user.sessionId,
      userAgent: s.userAgent ?? "",
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
  };
});

export const DELETE = authRoute(async ({ user }) => {
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
  await audit(user.id, "sessions_revoked_all");
  return { ok: true };
});
