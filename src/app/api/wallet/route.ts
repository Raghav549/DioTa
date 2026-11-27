import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { authRoute } from "@/lib/api";
import { payoutsAvailable } from "@/lib/payments";
import { walletSummary } from "@/lib/wallet";

export const GET = authRoute(async ({ user }) => {
  const [w, methods] = await Promise.all([
    walletSummary(user.id),
    db.select().from(paymentMethods).where(eq(paymentMethods.userId, user.id)).orderBy(desc(paymentMethods.createdAt)),
  ]);
  return {
    ...w,
    methods: methods.map((m) => ({ id: m.id, kind: m.kind, display: m.display, status: m.status })),
    payoutsAvailable: payoutsAvailable(),
    // No marketplace partner is connected yet; rewards can only appear once verified buyers exist.
    rewardsActive: false,
    partnersConnected: 0,
  };
});
