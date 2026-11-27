import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { uniqueViolation } from "@/lib/api";
import { hashPassword, randomToken, safeEqual } from "@/lib/crypto";
import { audit, notify } from "@/lib/events";
import { rateLimit, clientIp } from "@/lib/security";
import { CONSENT_VERSION } from "@/lib/catalog";
import { googleConfigured, googleRedirectUri, oauthCookieName } from "@/lib/oauth";
import { isSecureOrigin, originOf } from "@/lib/origin";
import { configProblems } from "@/lib/config";
import { ensureSchema } from "@/db/migrate";

// Always run per request; never pre-render or cache an OAuth callback.
export const dynamic = "force-dynamic";

type GoogleProfile = { sub?: string; email?: string; email_verified?: boolean | string; name?: string };

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  const cookieName = oauthCookieName(isSecureOrigin(origin));
  const done = (path: string) => {
    const r = NextResponse.redirect(new URL(path, origin));
    r.headers.set("Cache-Control", "no-store");
    r.cookies.set(cookieName, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: isSecureOrigin(origin) });
    return r;
  };
  const fail = (code = "google") => done(`/login?e=${code}`);

  try {
    if (!googleConfigured()) return fail();
    const problems = configProblems();
    if (problems.length) {
      console.error(`[config] ${problems.join("; ")}`);
      return fail();
    }
    await ensureSchema();
    if (!(await rateLimit(`google:${await clientIp()}`, 20, 600))) return fail();

    const sp = req.nextUrl.searchParams;
    const code = sp.get("code");
    const state = sp.get("state");
    const [savedState, verifier] = (req.cookies.get(cookieName)?.value ?? "").split(".");
    if (sp.get("error") || !code || code.length > 2048 || !state || !savedState || !verifier || !safeEqual(state, savedState)) {
      return fail();
    }

    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri(origin),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!tok.ok) return fail();
    const { access_token } = (await tok.json()) as { access_token?: string };
    if (!access_token) return fail();

    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!info.ok) return fail();
    const p = (await info.json()) as GoogleProfile;
    const verified = p.email_verified === true || p.email_verified === "true";
    if (!p.sub || !p.email || !verified || p.email.length > 254) return fail();
    const email = p.email.toLowerCase();

    let [u] = await db.select().from(users).where(eq(users.googleId, p.sub)).limit(1);
    if (!u) {
      const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (byEmail) {
        // Do NOT silently link Google to an existing password account. Sign-up does not verify
        // email ownership, so auto-linking would let someone who pre-registered a victim's email
        // keep password access to the account the victim then uses (account pre-hijacking).
        await audit(byEmail.id, "login_google_link_refused");
        return fail("google_exists");
      }
      try {
        [u] = await db
          .insert(users)
          .values({
            name: (p.name?.trim() || email.split("@")[0]).slice(0, 80),
            email,
            googleId: p.sub,
            passwordHash: await hashPassword(randomToken(32)), // unusable random password
            consentVersion: CONSENT_VERSION,
          })
          .returning();
      } catch (e) {
        if (uniqueViolation(e) !== null) return fail("google_exists"); // concurrent sign-up, same email
        throw e;
      }
      await notify(u.id, "welcome", "security");
    }

    await createSession(u.id);
    await audit(u.id, "login_google");
    return done("/home");
  } catch (e) {
    console.error("google oauth error", e instanceof Error ? e.message : "unknown");
    return fail();
  }
}
