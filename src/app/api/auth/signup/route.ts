import { cookies } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { consents, users } from "@/db/schema";
import { ApiError, publicRoute, readBody, uniqueViolation } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { CONSENT_VERSION, isLang } from "@/lib/catalog";
import { generateRecoveryKey, hashPassword, hashRecoveryKey } from "@/lib/crypto";
import { audit, notify } from "@/lib/events";
import { signupSchema } from "@/lib/validation";

export const POST = publicRoute(
  async ({ req }) => {
    const b = await readBody(req, signupSchema);
    const phone = b.phone ?? null;

    const existing = await db
      .select({ email: users.email, phone: users.phone })
      .from(users)
      .where(phone ? or(eq(users.email, b.email), eq(users.phone, phone)) : eq(users.email, b.email));
    if (existing.some((e) => e.email === b.email)) throw new ApiError("email_taken", 409);
    if (existing.length) throw new ApiError("phone_taken", 409);

    const lang = (await cookies()).get("dt_lang")?.value;
    const recoveryKey = generateRecoveryKey();
    // Compute everything that can fail for non-database reasons BEFORE touching the database,
    // so a configuration problem can never leave a half-created account behind.
    const values = {
      name: b.name,
      email: b.email,
      phone,
      passwordHash: await hashPassword(b.password),
      recoveryHash: hashRecoveryKey(recoveryKey),
      language: isLang(lang) ? lang : "en",
      consentVersion: CONSENT_VERSION,
    };
    let userId: string;
    try {
      userId = await db.transaction(async (tx) => {
        const [u] = await tx.insert(users).values(values).returning({ id: users.id });
        await tx.insert(consents).values([
          { userId: u.id, scope: "terms", granted: true, version: CONSENT_VERSION },
          { userId: u.id, scope: "privacy", granted: true, version: CONSENT_VERSION },
        ]);
        return u.id;
      });
    } catch (e) {
      // Only a genuine duplicate is reported as "already registered". Anything else is a real
      // error and must surface as such (it used to be masked as "email taken").
      const c = uniqueViolation(e);
      if (c === null) throw e;
      throw new ApiError(c.includes("phone") ? "phone_taken" : "email_taken", 409);
    }
    await createSession(userId);
    await notify(userId, "welcome", "security");
    await audit(userId, "signup");
    return { recoveryKey };
  },
  { rate: { name: "signup", max: 10, windowSec: 3600 } },
);
