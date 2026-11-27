import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Splash } from "@/components/Splash";
import { NativeLaunch } from "@/components/NativeLaunch";

/** The DioTa Android app adds this to its WebView user agent (android/.../MainActivity.java). */
const APP_UA = /\bDioTaAndroid\//;

export default async function Page({ searchParams }: { searchParams: Promise<{ launch?: string }> }) {
  const [user, h, q] = await Promise.all([getCurrentUser(), headers(), searchParams]);
  const app = APP_UA.test(h.get("user-agent") ?? "");
  // Android app launch: the phone itself already shows the DioTa splash from the very first frame,
  // so go straight to the first screen (Home, or the intro / sign-in for someone new).
  if (app && q.launch === "native") {
    if (user) redirect("/home");
    return <NativeLaunch />;
  }
  // Older app versions open here on every launch and play the web splash first.
  if (app) return <Splash signedIn={!!user} />;
  if (user) redirect("/home");
  return <Splash signedIn={false} />;
}
