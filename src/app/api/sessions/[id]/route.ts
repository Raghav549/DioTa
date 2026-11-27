import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { ApiError, authRoute } from "@/lib/api";
import { audit } from "@/lib/events";

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw new ApiError("not_found", 404);
  if (params.id === user.sessionId) throw new ApiError("invalid_input");
  await db.delete(sessions).where(and(eq(sessions.id, params.id), eq(sessions.userId, user.id)));
  await audit(user.id, "session_revoked");
  return { ok: true };
});
