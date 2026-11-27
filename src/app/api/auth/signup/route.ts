import { cookies } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { consents, users } from "@/db/schema";
import { ApiError, publicRoute, readBody } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { CONSENT_VERSION, isLang } from "@/lib/catalog";
import { generateRecoveryKey, hashPassword, hashRecoveryKey } from "@/lib/crypto";
import { audit, notify } from "@/lib/events";
import { signupSchema } from "@/lib/validation";

export const POST = publicRoute(
  async ({ req }) => {
    const b = await readBody(req, signupSchema);
    const phone = b.phone ? (b.phone.startsWith("+") ? b.phone : b.phone) : null;

    const existing = await db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(phone ? or(eq(users.email, b.email), eq(users.phone, phone)) : eq(users.email, b.email));
    if (existing.some((e) => e.email === b.email)) throw new ApiError("email_taken", 409);
    if (existing.length) throw new ApiError("phone_taken", 409);

    const lang = (await cookies()).get("dt_lang")?.value;
    const recoveryKey = generateRecoveryKey();
    let userId: string;
    try {
      const [u] = await db
        .insert(users)
        .values({
          name: b.name,
          email: b.email,
          phone,
          passwordHash: await hashPassword(b.password),
          recoveryHash: hashRecoveryKey(recoveryKey),
          language: isLang(lang) ? lang : "en",
          consentVersion: CONSENT_VERSION,
        })
        .returning({ id: users.id });
      userId = u.id;
    } catch {
      throw new ApiError("email_taken", 409);
    }
    await db.insert(consents).values([
      { userId, scope: "terms", granted: true, version: CONSENT_VERSION },
      { userId, scope: "privacy", granted: true, version: CONSENT_VERSION },
    ]);
    await createSession(userId);
    await notify(userId, "welcome", "security");
    await audit(userId, "signup");
    return { recoveryKey };
  },
  { rate: { name: "signup", max: 10, windowSec: 3600 } },
);
