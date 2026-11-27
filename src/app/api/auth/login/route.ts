import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, publicRoute, readBody } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { dummyHash, verifyPassword } from "@/lib/crypto";
import { audit, recordEvent } from "@/lib/events";
import { loginSchema } from "@/lib/validation";

const MAX_FAILS = 5;
const LOCK_MIN = 15;

export const POST = publicRoute(
  async ({ req }) => {
    const b = await readBody(req, loginSchema);
    const id = b.identifier.trim();
    const where = id.includes("@") ? eq(users.email, id.toLowerCase()) : eq(users.phone, id.replace(/[\s-]/g, ""));
    const [u] = await db.select().from(users).where(where).limit(1);

    if (!u) {
      await verifyPassword(b.password, await dummyHash());
      throw new ApiError("invalid_credentials", 401);
    }
    if (u.lockedUntil && u.lockedUntil > new Date()) {
      await audit(u.id, "login_blocked_locked");
      throw new ApiError("locked", 423);
    }
    const ok = await verifyPassword(b.password, u.passwordHash);
    if (!ok) {
      const fails = u.failedAttempts + 1;
      const lock = fails % MAX_FAILS === 0 ? new Date(Date.now() + LOCK_MIN * 60_000) : null;
      await db.update(users).set({ failedAttempts: fails, lockedUntil: lock }).where(eq(users.id, u.id));
      await audit(u.id, "login_failed", { fails });
      throw new ApiError("invalid_credentials", 401);
    }
    await db.update(users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));
    await createSession(u.id);
    await audit(u.id, "login");
    await recordEvent(u.id, "login");
    return { language: u.language, theme: u.theme };
  },
  { rate: { name: "login", max: 30, windowSec: 600 } },
);
