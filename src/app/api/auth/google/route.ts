import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { originOf } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id || !process.env.GOOGLE_CLIENT_SECRET) return NextResponse.redirect(new URL("/login?e=google", originOf(req)));
  const state = randomToken(16);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", `${originOf(req)}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  const res = NextResponse.redirect(url);
  res.cookies.set("dt_oauth", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600, secure: originOf(req).startsWith("https") });
  return res;
}
