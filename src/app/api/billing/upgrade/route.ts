import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { upiPayments } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { PLAN_PRICE_PAISE, newRef, upiUrl } from "@/lib/billing";
import { audit } from "@/lib/events";

/**
 * Starts an Upgrade payment: records a pending order and returns the upi://pay link the Android app
 * opens in the phone's UPI apps. (Older unfinished attempts of this user are closed.)
 */
export const POST = authRoute(
  async ({ user }) => {
    await db
      .update(upiPayments)
      .set({ status: "failed" })
      .where(and(eq(upiPayments.userId, user.id), eq(upiPayments.status, "pending")));
    const ref = newRef();
    await db.insert(upiPayments).values({ userId: user.id, ref, amountPaise: PLAN_PRICE_PAISE });
    await audit(user.id, "upgrade_started", { ref });
    return { ref, url: upiUrl() };
  },
  { rate: { name: "upgrade", max: 10, windowSec: 600 } },
);
