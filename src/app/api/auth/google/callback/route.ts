import { NextResponse, type NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { hashPassword, randomToken, safeEqual } from "@/lib/crypto";
import { audit, notify } from "@/lib/events";
import { rateLimit, clientIp } from "@/lib/security";
import { CONSENT_VERSION } from "@/lib/catalog";
import { originOf } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const fail = () => {
    const r = NextResponse.redirect(new URL("/login?e=google", origin));
    r.cookies.delete("dt_oauth");
    return r;
  };
  try {
    if (!(await rateLimit(`google:${await clientIp()}`, 20, 600))) return fail();
    const id = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const saved = req.cookies.get("dt_oauth")?.value;
    if (!id || !secret || !code || !state || !saved || !safeEqual(state, saved)) return fail();

    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tok.ok) return fail();
    const { access_token } = (await tok.json()) as { access_token?: string };
    if (!access_token) return fail();
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!info.ok) return fail();
    const p = (await info.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!p.sub || !p.email || !p.email_verified) return fail();
    const email = p.email.toLowerCase();

    let [u] = await db.select().from(users).where(or(eq(users.googleId, p.sub), eq(users.email, email))).limit(1);
    if (!u) {
      [u] = await db
        .insert(users)
        .values({
          name: (p.name ?? email.split("@")[0]).slice(0, 80),
          email,
          googleId: p.sub,
          passwordHash: await hashPassword(randomToken(32)),
          consentVersion: CONSENT_VERSION,
        })
        .returning();
      await notify(u.id, "welcome", "security");
    } else if (!u.googleId) {
      await db.update(users).set({ googleId: p.sub }).where(eq(users.id, u.id));
    }
    await createSession(u.id);
    await audit(u.id, "login_google");
    const res = NextResponse.redirect(new URL("/home", origin));
    res.cookies.delete("dt_oauth");
    return res;
  } catch {
    return fail();
  }
}
