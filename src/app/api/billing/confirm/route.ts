import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { upiPayments, users } from "@/db/schema";
import { ApiError, authRoute, readBody, uniqueViolation } from "@/lib/api";
import { ORDER_TTL_MS, PLAN_DAYS, UPI_TOKEN_RE } from "@/lib/billing";
import { audit, recordEvent } from "@/lib/events";
import { storageState } from "@/lib/storage";
import { upiConfirmSchema } from "@/lib/validation";

/**
 * The UPI app's answer for an Upgrade payment (relayed by the Android app right after the user
 * paid). A successful answer for this user's open order, with the transaction's UPI references,
 * activates the plan for 30 days (or extends it). Each UPI transaction can be used only once.
 */
export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, upiConfirmSchema, 2_000);
    const [order] = await db
      .select()
      .from(upiPayments)
      .where(and(eq(upiPayments.ref, b.ref), eq(upiPayments.userId, user.id)))
      .limit(1);
    if (!order) throw new ApiError("not_found", 404);
    if (order.status === "paid") return { active: true, storage: await storageState(await fresh(user.id)) };
    if (order.status !== "pending" || Date.now() - order.createdAt.getTime() > ORDER_TTL_MS) throw new ApiError("payment_expired", 410);

    if (b.status === "submitted" || b.status === "pending") throw new ApiError("payment_pending", 409);
    if (b.status !== "success") {
      await db.update(upiPayments).set({ status: "failed", responseCode: b.responseCode || null }).where(eq(upiPayments.id, order.id));
      throw new ApiError(b.status === "cancelled" ? "payment_cancelled" : "payment_failed", 402);
    }
    const txnId = UPI_TOKEN_RE.test(b.txnId) ? b.txnId : null;
    const approvalRef = UPI_TOKEN_RE.test(b.approvalRef) ? b.approvalRef : null;
    if (!txnId && !approvalRef) throw new ApiError("payment_unverified", 402);

    try {
      await db.transaction(async (tx) => {
        const done = await tx
          .update(upiPayments)
          .set({ status: "paid", txnId, approvalRef, responseCode: b.responseCode || null, paidAt: new Date() })
          .where(and(eq(upiPayments.id, order.id), eq(upiPayments.status, "pending")))
          .returning({ id: upiPayments.id });
        if (!done.length) return; // confirmed concurrently
        await tx
          .update(users)
          .set({
            plan: "pro",
            planUntil: sql`greatest(coalesce(${users.planUntil}, now()), now()) + (${PLAN_DAYS} * interval '1 day')`,
          })
          .where(eq(users.id, user.id));
      });
    } catch (e) {
      if (uniqueViolation(e)) throw new ApiError("payment_used", 409);
      throw e;
    }
    await recordEvent(user.id, "upgrade", {});
    await audit(user.id, "upgrade_paid", { ref: order.ref });
    return { active: true, storage: await storageState(await fresh(user.id)) };
  },
  { rate: { name: "upgrade-confirm", max: 20, windowSec: 600 } },
);

async function fresh(id: string) {
  const [u] = await db.select({ id: users.id, plan: users.plan, planUntil: users.planUntil }).from(users).where(eq(users.id, id)).limit(1);
  return u;
}
