import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ApiError, publicRoute, readBody } from "@/lib/api";
import { generateRecoveryKey, hashPassword, hashRecoveryKey, safeEqual } from "@/lib/crypto";
import { audit, notify } from "@/lib/events";
import { recoverSchema } from "@/lib/validation";

export const POST = publicRoute(
  async ({ req }) => {
    const b = await readBody(req, recoverSchema);
    const [u] = await db.select().from(users).where(eq(users.email, b.email)).limit(1);
    const candidate = hashRecoveryKey(b.recoveryKey);
    const ok = !!u && !!u.recoveryHash && safeEqual(candidate, u.recoveryHash);
    if (!ok || !u) {
      if (u) await audit(u.id, "recovery_failed");
      throw new ApiError("recovery_invalid", 400);
    }
    const recoveryKey = generateRecoveryKey();
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(b.password),
        recoveryHash: hashRecoveryKey(recoveryKey),
        failedAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, u.id));
    await db.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(u.id, "password_recovered");
    await notify(u.id, "password", "security");
    return { recoveryKey };
  },
  { rate: { name: "recover", max: 5, windowSec: 3600 } },
);
