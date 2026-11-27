import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { googleConfigured, googleRedirectUri, oauthCookieName, pkceChallenge } from "@/lib/oauth";
import { isSecureOrigin, originOf } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = originOf(req);
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?e=google", origin));

  // The state cookie must be set on the same host Google will redirect back to.
  const requestHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (process.env.APP_URL && requestHost && requestHost !== new URL(origin).host) {
    return NextResponse.redirect(new URL("/api/auth/google", origin));
  }

  const state = randomToken(24);
  const verifier = randomToken(48);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", googleRedirectUri(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");

  const secure = isSecureOrigin(origin);
  const res = NextResponse.redirect(url);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(oauthCookieName(secure), `${state}.${verifier}`, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/",
    maxAge: 600,
    secure,
  });
  return res;
}
