import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { generateRecoveryKey, hashRecoveryKey, verifyPassword } from "@/lib/crypto";
import { audit } from "@/lib/events";
import { passwordOnlySchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, passwordOnlySchema);
    if (!(await verifyPassword(b.password, user.passwordHash))) throw new ApiError("current_pw", 400);
    const recoveryKey = generateRecoveryKey();
    await db.update(users).set({ recoveryHash: hashRecoveryKey(recoveryKey) }).where(eq(users.id, user.id));
    await audit(user.id, "recovery_key_rotated");
    return { recoveryKey };
  },
  { rate: { name: "rec", max: 10, windowSec: 3600 } },
);
