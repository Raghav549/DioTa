import { db } from "@/db";
import { supportRequests } from "@/db/schema";
import { authRoute, readBody } from "@/lib/api";
import { audit } from "@/lib/events";
import { supportSchema } from "@/lib/validation";

export const POST = authRoute(
  async ({ req, user }) => {
    const b = await readBody(req, supportSchema);
    await db.insert(supportRequests).values({ userId: user.id, ...b });
    await audit(user.id, "support_request");
    return { ok: true };
  },
  { rate: { name: "support", max: 10, windowSec: 3600 } },
);
