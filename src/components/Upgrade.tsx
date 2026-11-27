"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Card, Skeleton } from "@/components/ui";
import { ANDROID_APK_URL } from "@/lib/androidApp";
import { ApiErr, api, bytes, dateFmt, useApi } from "@/lib/client";
import { Phone, useIsNative } from "@/lib/native";

/** Mirrors StorageState in src/lib/storage.ts. */
export type Storage = { plan: "free" | "pro"; planUntil: string | null; used: number; warnAt: number; limit: number; warn: boolean; full: boolean };

export const UPGRADE_HREF = "/profile/upgrade";
const BENEFITS = ["up.b1", "up.b2", "up.b3", "up.b4"] as const;

/** Tells the shell and every screen that the account (plan / storage) changed. */
const changed = () => window.dispatchEvent(new Event("dt:me-changed"));

/**
 * Account → Upgrade: ₹199 / month. Paying opens the phone's UPI apps (the payee is in the server's
 * payment link, never shown here); the UPI app's answer is confirmed with the server, the plan goes
 * live at once (1 GB, capture resumes) and the screen returns to where the user came from.
 */
export function UpgradeSection() {
  const { t, locale, toast, errText } = useApp();
  const router = useRouter();
  const native = useIsNative();
  const { data, reload } = useApi<{ storage: Storage }>("/api/me");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(leave.current), []);

  async function pay() {
    if (busy) return;
    setBusy(true);
    try {
      const order = await api<{ ref: string; url: string }>("/api/billing/upgrade", { method: "POST" });
      const r = await Phone.payUpi(order.url);
      if (r.status === "cancelled") throw new ApiErr("payment_cancelled", 402);
      await api("/api/billing/confirm", { body: { ref: order.ref, ...r } });
      Phone.setCapture(true).catch(() => {});
      changed();
      await reload();
      setDone(true);
      leave.current = setTimeout(() => (window.history.length > 1 ? router.back() : router.replace("/profile")), 2200);
    } catch (e) {
      const code = e instanceof ApiErr ? e.code : e instanceof Error ? e.message : "";
      toast(code === "no_upi_app" ? t("up.noapp") : errText(e instanceof ApiErr ? e : new ApiErr(code || "generic", 0)), "err");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Card className="flex flex-col items-center py-10 text-center">
        <motion.span
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 16 }}
          className="grid h-16 w-16 place-items-center rounded-full bg-good/15 text-good"
        >
          <Icon name="check" size={32} stroke={2.5} />
        </motion.span>
        <p className="mt-4 text-xl font-bold">{t("up.active")}</p>
        <p className="mt-1 text-sm text-muted">{t("up.active.b")}</p>
      </Card>
    );

  if (!data) return <Skeleton className="h-96" />;
  const s = data.storage;
  const pro = s.plan === "pro";
  const pct = Math.min(100, (s.used / s.limit) * 100);

  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-muted">{t("up.storage")}</p>
          <p className="text-sm font-semibold">
            {bytes(s.used, locale)} / {bytes(s.limit, locale)}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
          <div className={`h-full rounded-full ${s.full ? "bg-bad" : s.warn ? "bg-warn" : "bg-good"}`} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      <Card>
        <p className="font-display text-4xl font-semibold">
          {t("up.price")}
          <span className="text-base font-semibold text-muted"> / {t("up.month")}</span>
        </p>
        <ul className="mt-5 space-y-3">
          {BENEFITS.map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-good/15 text-good">
                <Icon name="check" size={16} stroke={2.5} />
              </span>
              <span className="font-semibold">
                {i + 1}. {t(k)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          {pro ? (
            <div className="rounded-2xl bg-good/12 p-4 text-center">
              <p className="font-bold text-good">{t("up.active")}</p>
              {s.planUntil && <p className="mt-1 text-sm text-muted">{t("up.until", { date: dateFmt(s.planUntil, locale) })}</p>}
            </div>
          ) : native ? (
            <Button full loading={busy} onClick={pay}>
              <Icon name="up" size={18} />
              {t("up.btn")}
            </Button>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted">{t("up.web")}</p>
              <a href={ANDROID_APK_URL} className="btn-primary flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold">
                <Icon name="download" size={18} />
                Android APK
              </a>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

/**
 * Storage alerts above every screen: from 20 MB a warning, at 50 MB (capture stopped) "Oops".
 * Both link to Upgrade.
 */
export function StorageAlert({ storage }: { storage?: Storage }) {
  const { t } = useApp();
  if (!storage || !storage.warn) return null;
  return (
    <Link href={UPGRADE_HREF} className="glass mb-4 flex items-center gap-3 p-4" role="alert">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${storage.full ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn"}`}>
        <Icon name="alert" size={20} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{storage.full ? t("st.full") : t("st.warn")}</span>
      <span className="shrink-0 text-sm font-bold text-primary">{t("s.upgrade")}</span>
    </Link>
  );
}
