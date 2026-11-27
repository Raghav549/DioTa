"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { ANDROID_APK_URL, ANDROID_BUILDS_URL, ONBOARDED_KEY } from "@/lib/androidApp";
import { Phone, isNative, useIsNative, type NativeStatus, type PermName } from "@/lib/native";

type Step = { id: PermName | "apps"; icon: IconName; key: string };

const STEPS: Step[] = [
  { id: "apps", icon: "apps", key: "apps" },
  { id: "usage", icon: "chart", key: "usage" },
  { id: "vpn", icon: "block", key: "vpn" },
  { id: "notifications", icon: "bell", key: "notifications" },
  { id: "battery", icon: "battery", key: "battery" },
  { id: "camera", icon: "camera", key: "camera" },
  { id: "photos", icon: "file", key: "photos" },
];

/** Phone access: asks for every Android permission DioTa needs, one clear card at a time. */
export default function DevicePage() {
  const { t } = useApp();
  const router = useRouter();
  const native = useIsNative();
  const [st, setSt] = useState<NativeStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => Phone.status().then(setSt, () => {}), []);

  useEffect(() => {
    if (!isNative()) return;
    refresh();
    // Special access (usage, battery) is granted in Android settings; re-check when the user comes back.
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  async function ask(name: PermName) {
    setBusy(name);
    try {
      setSt(await Phone.request(name));
    } catch {
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function askAll() {
    for (const s of STEPS) {
      if (s.id === "apps" || st?.[s.id]) continue;
      setBusy(s.id);
      try {
        const next = await Phone.request(s.id);
        setSt(next);
      } catch {
        /* the user can retry this one */
      }
    }
    setBusy(null);
  }

  function done() {
    localStorage.setItem(ONBOARDED_KEY, "1");
    router.replace("/apps?scan=1");
  }

  if (!native) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("dv.title")} back="/profile" />
        <Card className="space-y-4 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-[#0d0d0f] text-white"><Icon name="device" size={30} /></span>
          <h2 className="text-xl font-bold">{t("dv.web.t")}</h2>
          <p className="text-muted">{t("dv.web.b")}</p>
          <a href={ANDROID_APK_URL} className="btn-primary flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 font-semibold">
            <Icon name="download" size={18} />Android APK
          </a>
          <a href={ANDROID_BUILDS_URL} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-muted underline underline-offset-4">GitHub Actions</a>
        </Card>
      </div>
    );
  }

  const granted = STEPS.filter((s) => (s.id === "apps" ? st?.apps : st?.[s.id])).length;
  const allOn = granted === STEPS.length;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader title={t("dv.title")} back="/profile" />
      <Card className="space-y-3">
        <p className="text-muted">{t("dv.b")}</p>
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-track">
            <motion.div className="h-full rounded-full bg-[#0d0d0f] dark:bg-white" initial={{ width: 0 }} animate={{ width: `${(granted / STEPS.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-sm font-semibold">{t("dv.progress", { n: granted, total: STEPS.length })}</span>
        </div>
      </Card>

      {!st ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const on = s.id === "apps" ? st.apps : st[s.id];
            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass flex items-center gap-4 p-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${on ? "bg-good/15 text-good" : "bg-track text-fg"}`}>
                  <Icon name={on ? "check" : s.icon} size={22} stroke={on ? 2.6 : 1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t(`dv.${s.key}.t`)}</p>
                  <p className="text-sm text-muted">{t(`dv.${s.key}.b`)}</p>
                </div>
                {on ? (
                  <span className="shrink-0 text-sm font-semibold text-good">{t("dv.on")}</span>
                ) : s.id !== "apps" ? (
                  <Button className="shrink-0 !px-4 !py-2.5 text-sm" loading={busy === s.id} disabled={!!busy && busy !== s.id} onClick={() => ask(s.id as PermName)}>
                    {t("dv.allow")}
                  </Button>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="space-y-3 pt-2">
        {!allOn && (
          <Button full variant="soft" loading={!!busy} onClick={askAll}>
            {t("dv.all")}
          </Button>
        )}
        <Button full onClick={done}>
          {t("dv.done")}
        </Button>
      </div>
      {st && <p className="text-center text-xs text-muted">DioTa {st.version} · Android API {st.sdk}{st.firewallRunning ? " · " + t("dv.vpn.t") + " ✓" : ""}</p>}
    </div>
  );
}
