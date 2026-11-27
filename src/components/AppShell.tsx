"use client";
import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Avatar, type AvatarUser } from "@/components/Avatar";
import { Wordmark } from "@/components/Wordmark";
import { useApi, haptic, whenIdle, prefetchApi } from "@/lib/client";
import { autoSync } from "@/lib/deviceSync";
import { Phone, isNative } from "@/lib/native";
import { ONBOARDED_KEY } from "@/lib/androidApp";
import { StorageAlert, UPGRADE_HREF, type Storage } from "@/components/Upgrade";
import HomeTab from "@/components/tabs/HomeTab";
import AppsTab from "@/components/tabs/AppsTab";
import VaultTab from "@/components/tabs/VaultTab";
import WalletTab from "@/components/tabs/WalletTab";
import ProfileTab from "@/components/tabs/ProfileTab";

const NAV: { href: string; key: string; icon: IconName }[] = [
  { href: "/home", key: "nav.home", icon: "home" },
  { href: "/apps", key: "nav.apps", icon: "apps" },
  { href: "/vault", key: "nav.vault", icon: "vault" },
  { href: "/wallet", key: "nav.wallet", icon: "wallet" },
  { href: "/profile", key: "nav.profile", icon: "user" },
];

/**
 * The five tab screens stay mounted for the whole session (React <Activity>): switching tabs only
 * flips which one is visible, so it is instant and never re-builds a screen. A hidden tab keeps its
 * state and scroll content but is frozen: its effects (data polling, live streams, timers) are
 * disconnected and its updates wait, so nothing in the background competes with a tap.
 * Static elements: re-renders of the shell never re-render a tab.
 */
const TAB_VIEWS: Record<string, ReactNode> = {
  "/home": <HomeTab />,
  "/vault": <VaultTab />,
  "/wallet": <WalletTab />,
  "/profile": <ProfileTab />,
};
const TAB_HREFS = NAV.map((n) => n.href);
/** The data the tabs show first, fetched in idle time so a tab opens already filled in. */
const TAB_DATA = ["/api/dashboard", "/api/apps", "/api/vault", "/api/wallet", "/api/notifications"];

export function AppShell({ children }: { children: ReactNode; name: string }) {
  const { t } = useApp();
  const path = usePathname();
  const { data: me, reload: reloadMe } = useApi<{ user: AvatarUser & { protectionEnabled?: boolean }; storage?: Storage }>("/api/me");
  useEffect(() => {
    // The profile page fires this after the photo or name changes, so the header updates at once.
    window.addEventListener("dt:me-changed", reloadMe);
    return () => window.removeEventListener("dt:me-changed", reloadMe);
  }, [reloadMe]);
  // The tapped tab lights up on the tap itself, before the new screen has even started rendering.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  const routeActive = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"))?.href;
  const pending = tapped && tapped.from === path ? tapped.href : null;
  const active = pending ?? routeActive;

  // Which screen is on: a kept-alive tab (also the instant a tab is touched), or a sub-screen.
  const routeTab = TAB_HREFS.includes(path) ? path : null;
  const shownTab = pending ?? routeTab;
  // Mount the tab that is open now; the others are pre-built (hidden, no effects) once idle.
  const [mounted, setMounted] = useState<string[]>(() => (routeTab ? [routeTab] : []));
  const visible = shownTab && !mounted.includes(shownTab) ? [...mounted, shownTab] : mounted;
  useEffect(() => {
    let live = true;
    whenIdle().then(() => {
      if (!live) return;
      setMounted(TAB_HREFS);
      prefetchApi(TAB_DATA);
    });
    return () => {
      live = false;
    };
  }, []);
  // Apps opened with ?add=1 / ?scan=1 (Home's buttons) starts fresh with that sheet open.
  const search = useSearchParams();
  const appsKey = path === "/apps" && (search.get("add") || search.get("scan")) ? search.toString() : "apps";
  const appsView = useMemo(() => <AppsTab key={appsKey} />, [appsKey]);

  // Each tab switch starts at the top (as a new screen did); the entrance animation replays by
  // itself because the shown tab goes from hidden to displayed.
  const shownKey = shownTab ?? path;
  const lastShown = useRef(shownKey);
  useLayoutEffect(() => {
    if (lastShown.current === shownKey) return;
    lastShown.current = shownKey;
    window.scrollTo(0, 0);
  }, [shownKey]);

  // A touch on a tab navigates on touch-down; the click that follows is then swallowed.
  const navOnDown = useRef<string | null>(null);

  const router = useRouter();
  // Android app, first launch after sign-in: show the phone access screen once.
  useEffect(() => {
    if (isNative() && path !== "/device" && !localStorage.getItem(ONBOARDED_KEY)) router.replace("/device");
  }, [path, router]);

  // Android app: the tracker shield follows the Protection switch. Silent: it never pops up the VPN
  // dialog here (that is asked on the phone access screen or when you turn Protection on).
  const protectionOn = me?.user.protectionEnabled;
  useEffect(() => {
    if (!isNative() || protectionOn === undefined) return;
    let live = true;
    whenIdle().then(() => {
      if (live) Phone.setShield(protectionOn, false).catch(() => {});
    });
    return () => {
      live = false;
    };
  }, [protectionOn]);

  // Storage use is re-read (when idle) on every screen change, so the alerts are always current.
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => whenIdle().then(() => {
          if (live) reloadMe();
        }), 800);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [path, reloadMe]);

  // Android app: capture stops when storage is full and resumes after an upgrade / freeing space.
  const full = me?.storage?.full;
  useEffect(() => {
    if (!isNative() || full === undefined) return;
    Phone.setCapture(!full).catch(() => {});
  }, [full]);

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
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pb-36 pt-[max(1rem,var(--sat))] sm:px-6">
      <header className="mb-5 flex items-center justify-between">
        <Link href="/home" aria-label="DioTa">
          <Wordmark className="text-[2rem]" />
        </Link>
        <Link href="/profile" aria-label={t("nav.profile")} className="rounded-full shadow-sm transition-transform active:scale-95">
          <Avatar user={me?.user} size={44} />
        </Link>
      </header>
      {path !== UPGRADE_HREF && <StorageAlert storage={me?.storage} />}
      <main>
        {visible.map((href) => (
          <Activity key={href} mode={href === shownTab ? "visible" : "hidden"}>
            <div className="rise">
              {href === "/apps" ? appsView : TAB_VIEWS[href]}
            </div>
          </Activity>
        ))}
        <Activity mode={shownTab ? "hidden" : "visible"}>{children}</Activity>
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,var(--sab))]">
        <div className="glass flex max-w-full items-center gap-1 rounded-full p-2 shadow-2xl">
          {NAV.map((n) => {
            const on = active === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                prefetch
                scroll={false}
                aria-label={t(n.key)}
                aria-current={on ? "page" : undefined}
                // The pill moves and the tab shows on touch-down, before the finger lifts.
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  haptic(8);
                  navOnDown.current = n.href;
                  if (path === n.href) return;
                  setTapped({ href: n.href, from: path });
                  router.push(n.href, { scroll: false });
                }}
                onClick={(e) => {
                  if (navOnDown.current === n.href) {
                    navOnDown.current = null;
                    e.preventDefault();
                    return;
                  }
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  setTapped({ href: n.href, from: path });
                }}
                className="relative"
              >
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
