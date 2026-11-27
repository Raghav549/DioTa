"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/Icon";
import { useT } from "@/components/Providers";
import { Wordmark } from "@/components/Wordmark";
import { useApi, haptic } from "@/lib/client";

const NAV: { href: string; key: string; icon: IconName }[] = [
  { href: "/home", key: "nav.home", icon: "home" },
  { href: "/apps", key: "nav.apps", icon: "apps" },
  { href: "/vault", key: "nav.vault", icon: "vault" },
  { href: "/wallet", key: "nav.wallet", icon: "wallet" },
  { href: "/profile", key: "nav.profile", icon: "user" },
];

export function AppShell({ children }: { children: ReactNode; name: string }) {
  const t = useT();
  const path = usePathname();
  const { data } = useApi<{ unread: number }>("/api/notifications");
  const unread = data?.unread ?? 0;
  const active = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"))?.href;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <Link href="/home" aria-label="DioTa">
          <Wordmark className="text-[2rem]" />
        </Link>
        <Link href="/notifications" aria-label={t("nt.title")} className="relative grid h-11 w-11 place-items-center rounded-full border border-line bg-surface">
          <Icon name="bell" size={20} />
          {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-primary2 ring-2 ring-[var(--bg)]" />}
        </Link>
      </header>
      <main>{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="glass flex items-center gap-1 rounded-full p-2 shadow-2xl">
          {NAV.map((n) => {
            const on = active === n.href;
            return (
              <Link key={n.href} href={n.href} aria-label={t(n.key)} aria-current={on ? "page" : undefined} onClick={() => haptic(8)} className="relative">
                <motion.span layout transition={{ type: "spring", stiffness: 500, damping: 34 }} className={`relative flex h-12 items-center justify-center gap-2 rounded-full ${on ? "px-4 text-white" : "w-12 text-muted"}`}>
                  {on && <motion.span layoutId="nav-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-full btn-primary" />}
                  <Icon name={n.icon} size={22} className="relative" />
                  {on && (
                    <motion.span initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} className="relative overflow-hidden whitespace-nowrap text-sm font-semibold">
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
