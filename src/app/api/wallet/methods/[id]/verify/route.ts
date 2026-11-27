import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { ApiError, authRoute } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/events";
import { getProvider } from "@/lib/payments";

export const POST = authRoute<{ id: string }>(
  async ({ user, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) throw new ApiError("not_found", 404);
    const [m] = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, params.id), eq(paymentMethods.userId, user.id)))
      .limit(1);
    if (!m) throw new ApiError("not_found", 404);
    const provider = getProvider();
    if (!provider) throw new ApiError("verify_unavailable", 503);
    const ok = await provider.verifyMethod({ kind: m.kind as "upi" | "bank", detail: decrypt(user.id, m.detailEnc) });
    await db.update(paymentMethods).set({ status: ok ? "verified" : "failed" }).where(eq(paymentMethods.id, m.id));
    await audit(user.id, "payment_method_verify", { ok });
    return { status: ok ? "verified" : "failed" };
  },
  { rate: { name: "pmv", max: 10, windowSec: 3600 } },
);
