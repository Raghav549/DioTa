import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { audit, notify, recordEvent } from "@/lib/events";
import { changePasswordSchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, changePasswordSchema);
    if (!(await verifyPassword(b.current, user.passwordHash))) throw new ApiError("current_pw", 400);
    await db.update(users).set({ passwordHash: await hashPassword(b.next) }).where(eq(users.id, user.id));
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
    await audit(user.id, "password_changed");
    await recordEvent(user.id, "password_changed");
    await notify(user.id, "password", "security");
    return { ok: true };
  },
  { rate: { name: "pw", max: 10, windowSec: 3600 } },
);
