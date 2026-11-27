"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Avatar, type AvatarUser } from "@/components/Avatar";
import { Wordmark } from "@/components/Wordmark";
import { useApi, haptic } from "@/lib/client";
import { autoSync } from "@/lib/deviceSync";
import { Phone, isNative } from "@/lib/native";
import { ONBOARDED_KEY } from "@/lib/androidApp";

const NAV: { href: string; key: string; icon: IconName }[] = [
  { href: "/home", key: "nav.home", icon: "home" },
  { href: "/apps", key: "nav.apps", icon: "apps" },
  { href: "/vault", key: "nav.vault", icon: "vault" },
  { href: "/wallet", key: "nav.wallet", icon: "wallet" },
  { href: "/profile", key: "nav.profile", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode; name: string }) {
  const { t } = useApp();
  const path = usePathname();
  const { data: me, reload: reloadMe } = useApi<{ user: AvatarUser }>("/api/me");
  useEffect(() => {
    // The profile page fires this after the photo or name changes, so the header updates at once.
    window.addEventListener("dt:me-changed", reloadMe);
    return () => window.removeEventListener("dt:me-changed", reloadMe);
  }, [reloadMe]);
  const active = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"))?.href;

  const router = useRouter();
  // Android app, first launch after sign-in: show the phone access screen once.
  useEffect(() => {
    if (isNative() && path !== "/device" && !localStorage.getItem(ONBOARDED_KEY)) router.replace("/device");
  }, [path, router]);

  // Android app: read real data from the phone when the app opens and whenever it comes back.
  useEffect(() => {
    if (!isNative()) return;
    const run = () =>
      autoSync((alerts) => {
        for (const a of alerts.slice(0, 3)) Phone.notify(t("nt.alert.t"), t("nt.native.t", { app: a.app, perm: t(`perm.${a.perm}`) })).catch(() => {});
      });
    run();
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [t]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <Link href="/home" aria-label="DioTa">
          <Wordmark className="text-[2rem]" />
        </Link>
        <Link href="/profile" aria-label={t("nav.profile")} className="rounded-full shadow-sm transition-transform active:scale-95">
          <Avatar user={me?.user} size={44} />
        </Link>
      </header>
      <main>{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="glass flex max-w-full items-center gap-1 rounded-full p-2 shadow-2xl">
          {NAV.map((n) => {
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href} aria-label={t(n.key)} aria-current={on ? "page" : undefined} onClick={() => haptic(8)} className="relative">
                <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }} className={`relative flex h-12 items-center justify-center gap-2 rounded-full ${on ? "px-4 text-white" : "w-11 text-muted"}`}>
                  {on && <motion.span layoutId="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-full btn-primary" />}
                  <Icon name={n.icon} size={22} className="relative" />
                  {on && (
                    <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} className="relative hidden max-w-[clamp(0rem,calc(100vw-19.5rem),6.5rem)] overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold min-[340px]:block">
                      {t(n.key)}
                    </motion.span>
                  )}
                </motion.span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
