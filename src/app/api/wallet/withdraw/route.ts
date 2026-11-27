import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethods, walletTransactions } from "@/db/schema";
import { ApiError, authRoute, readBody } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { audit, notify, recordEvent } from "@/lib/events";
import { getProvider } from "@/lib/payments";
import { withdrawSchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, withdrawSchema);
    const provider = getProvider();
    if (!provider) throw new ApiError("payout_unavailable", 503);
    const [m] = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, b.methodId), eq(paymentMethods.userId, user.id)))
      .limit(1);
    if (!m || m.status !== "verified") throw new ApiError("no_verified_method", 400);
    const paise = Math.round(b.amount * 100);
    if (!Number.isSafeInteger(paise) || paise < 1) throw new ApiError("invalid_input", 400);

    // Serialise withdrawals per user and check the balance inside the same transaction,
    // so two concurrent requests can never both spend the same funds.
    const tx = await db.transaction(async (t) => {
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${"withdraw:" + user.id}))`);
      const [bal] = await t
        .select({
          earned: sql<string>`coalesce(sum(case when ${walletTransactions.type} = 'reward' and ${walletTransactions.status} in ('verified','completed') then ${walletTransactions.amountPaise} else 0 end), 0)`,
          spent: sql<string>`coalesce(sum(case when ${walletTransactions.type} = 'withdrawal' and ${walletTransactions.status} <> 'failed' then ${walletTransactions.amountPaise} else 0 end), 0)`,
        })
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, user.id));
      if (paise > Number(bal.earned) - Number(bal.spent)) throw new ApiError("no_balance", 400);
      const [row] = await t
        .insert(walletTransactions)
        .values({ userId: user.id, type: "withdrawal", amountPaise: paise, status: "pending", methodId: m.id })
        .returning({ id: walletTransactions.id });
      return row;
    });
    try {
      const result = await provider.createPayout({
        amountPaise: paise,
        kind: m.kind as "upi" | "bank",
        detail: decrypt(user.id, m.detailEnc),
        reference: tx.id,
      });
      await db.update(walletTransactions).set({ status: result === "completed" ? "completed" : "pending" }).where(eq(walletTransactions.id, tx.id));
    } catch {
      await db.update(walletTransactions).set({ status: "failed" }).where(eq(walletTransactions.id, tx.id));
      throw new ApiError("payout_unavailable", 502);
    }
    await recordEvent(user.id, "withdraw_requested");
    await audit(user.id, "withdraw", { paise });
    await notify(user.id, "withdraw", "rewards");
    return { ok: true };
  },
  { rate: { name: "wd", max: 10, windowSec: 3600 } },
);
