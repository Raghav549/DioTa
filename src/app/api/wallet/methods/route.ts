import { db } from "@/db";
import { paymentMethods } from "@/db/schema";
import { authRoute, readBody } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { audit, recordEvent } from "@/lib/events";
import { methodSchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, methodSchema);
    let display: string;
    let detail: string;
    if (b.kind === "upi") {
      const [local, handle] = b.upi.split("@");
      display = `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${handle}`;
      detail = JSON.stringify({ upi: b.upi });
    } else {
      display = `${b.ifsc.slice(0, 4)} •••• ${b.account.slice(-4)}`;
      detail = JSON.stringify({ holder: b.holder, account: b.account, ifsc: b.ifsc });
    }
    await db.insert(paymentMethods).values({ userId: user.id, kind: b.kind, display, detailEnc: encrypt(user.id, detail) });
    await recordEvent(user.id, "payment_added");
    await audit(user.id, "payment_method_added", { kind: b.kind });
    return { ok: true };
  },
  { rate: { name: "pm", max: 20, windowSec: 3600 } },
);
