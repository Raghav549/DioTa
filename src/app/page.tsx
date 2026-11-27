import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Splash } from "@/components/Splash";

/** The DioTa Android app adds this to its WebView user agent (android/.../MainActivity.java). */
const APP_UA = /\bDioTaAndroid\//;

export default async function Page() {
  const [user, h] = await Promise.all([getCurrentUser(), headers()]);
  // The Android app opens here on every launch, so it always plays the splash first
  // (then Home when signed in, or the intro for someone new on this phone).
  if (APP_UA.test(h.get("user-agent") ?? "")) return <Splash signedIn={!!user} />;
  if (user) redirect("/home");
  return <Splash signedIn={false} />;
}
