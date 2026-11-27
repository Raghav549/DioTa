import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { ApiError, authRoute } from "@/lib/api";
import { audit, recordEvent } from "@/lib/events";

export const DELETE = authRoute<{ id: string }>(async ({ user, params }) => {
  if (!z.string().uuid().safeParse(params.id).success) throw new ApiError("not_found", 404);
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, params.id), eq(paymentMethods.userId, user.id)));
  await recordEvent(user.id, "payment_removed");
  await audit(user.id, "payment_method_removed");
  return { ok: true };
});
