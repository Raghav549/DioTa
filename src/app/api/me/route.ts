import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { publicUser } from "@/lib/auth";
import { audit, recordEvent } from "@/lib/events";
import { profileSchema } from "@/lib/validation";

export const GET = authRoute(async ({ user }) => ({ user: publicUser(user) }));

export const PATCH = authRoute(async ({ req, user }) => {
  const b = await readBody(req, profileSchema);
  if (b.phone && b.phone !== user.phone) {
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.phone, b.phone)).limit(1);
    if (dup) throw new ApiError("phone_taken", 409);
  }
  const [u] = await db.update(users).set(b).where(eq(users.id, user.id)).returning();
  if (b.protectionEnabled !== undefined && b.protectionEnabled !== user.protectionEnabled)
    await recordEvent(user.id, b.protectionEnabled ? "protection_on" : "protection_off");
  if (b.monitoringEnabled !== undefined && b.monitoringEnabled !== user.monitoringEnabled)
    await recordEvent(user.id, b.monitoringEnabled ? "global_monitoring_on" : "global_monitoring_off");
  await audit(user.id, "profile_update", { fields: Object.keys(b) });
  return { user: publicUser(u) };
});
