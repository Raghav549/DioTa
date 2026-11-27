import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { destroyCurrentSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { audit } from "@/lib/events";
import { passwordOnlySchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, passwordOnlySchema);
    if (!(await verifyPassword(b.password, user.passwordHash))) throw new ApiError("current_pw", 400);
    await audit(user.id, "account_deleted");
    await db.delete(users).where(eq(users.id, user.id)); // cascades to every personal record
    await destroyCurrentSession();
    return { ok: true };
  },
  { rate: { name: "del", max: 5, windowSec: 3600 } },
);
