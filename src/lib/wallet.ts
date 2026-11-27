import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { walletTransactions } from "@/db/schema";

/** Every figure is derived from recorded ledger rows. Nothing is estimated. */
export async function walletSummary(userId: string) {
  const txs = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.userId, userId))
    .orderBy(desc(walletTransactions.createdAt));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let lifetime = 0;
  let month = 0;
  let pending = 0;
  let withdrawn = 0;
  let verifiedCount = 0;
  for (const t of txs) {
    if (t.type === "reward") {
      if (t.status === "verified" || t.status === "completed") {
        lifetime += t.amountPaise;
        verifiedCount++;
        if (t.createdAt >= monthStart) month += t.amountPaise;
      } else if (t.status === "pending") pending += t.amountPaise;
    } else if (t.type === "withdrawal" && t.status !== "failed") {
      withdrawn += t.amountPaise;
    }
  }
  return {
    lifetime,
    month,
    pending,
    available: lifetime - withdrawn,
    verifiedCount,
    transactions: txs.slice(0, 100).map((t) => ({
      id: t.id,
      type: t.type,
      amountPaise: t.amountPaise,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    rewards: txs
      .filter((t) => t.type === "reward" && (t.status === "verified" || t.status === "completed"))
      .map((t) => ({ amountPaise: t.amountPaise, createdAt: t.createdAt.toISOString() })),
  };
}
