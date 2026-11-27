"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EventList, TxList, type Ev, type Tx } from "@/components/Activity";
import { Chart } from "@/components/Chart";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { AppLogo, Card, Empty, Skeleton } from "@/components/ui";
import { bytes, dateFmt, money, num, useApi } from "@/lib/client";
import { exportMyData, useIsNative } from "@/lib/native";

type Dash = {
  name: string;
  status: "protected" | "partial" | "off";
  appsMonitored: number;
  appsTotal: number;
  alerts: number;
  eventsTotal: number;
  eventTimes: string[];
  dataBytes: number;
  dataItems: number;
  wallet: { month: number; available: number; pending: number; lifetime: number };
  recentTx: Tx[];
  recentEvents: Ev[];
  deviceConnected: boolean;
  blockedApps: number;
  blockedAttempts: number;
  logos: { slug: string; logo: string | null; name: string }[];
};

const TONE = { protected: "var(--good)", partial: "var(--warn)", off: "var(--bad)" } as const;

export default function Home() {
  const { t, locale, errText, toast } = useApp();
  const { data: d, error, reload } = useApi<Dash>("/api/dashboard");
  const native = useIsNative();
  const [exporting, setExporting] = useState(false);

  async function doExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const name = await exportMyData();
      toast(t("ex.saved", { name }));
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setExporting(false);
    }
  }

  const series = useMemo(() => {
    if (!d) return [];
    const days = Array.from({ length: 7 }, (_, i) => {
      const x = new Date();
      x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - (6 - i));
      return x;
    });
    return days.map((day) => {
      const end = new Date(day);
      end.setDate(end.getDate() + 1);
      const value = d.eventTimes.filter((s) => {
        const ts = new Date(s);
        return ts >= day && ts < end;
      }).length;
      return { label: dateFmt(day.toISOString(), locale, { weekday: "short" }), value };
    });
  }, [d, locale]);

  if (error)
    return (
      <Card>
        <Empty icon="alert" title={errText(error)} action={<button onClick={reload} className="font-semibold text-primary">{t("c.retry")}</button>} />
      </Card>
    );
  if (!d)
    return (
      <div className="space-y-4">
        <Skeleton className="h-64" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
        <Skeleton className="h-56" />
      </div>
    );

  const tone = TONE[d.status];
  const actions: { icon: IconName; label: string; href?: string; onClick?: () => void; primary?: boolean }[] = [
    { icon: native ? "scan" : "plus", label: native ? t("sc.btn") : t("q.add_app"), href: native ? "/apps?scan=1" : "/apps?add=1", primary: true },
    { icon: "vault", label: t("q.vault"), href: "/vault" },
    { icon: "shield", label: t("q.protection"), href: "/protection" },
    { icon: "download", label: t("q.export"), onClick: doExport },
  ];
  const logos = d.logos;
  const extra = Math.max(0, d.appsTotal - logos.length);

  return (
    <div className="space-y-4">
      <p className="px-1 text-lg text-muted">{t("h.hello", { name: d.name.split(" ")[0] })}</p>

      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden p-6">
        <div className="relative">
          <h1 className="font-display text-[clamp(1.85rem,9vw,2.6rem)] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]" style={{ color: tone }}>
            {t(`h.st.${d.status}`)}
          </h1>
          <p className="mt-3 max-w-sm text-muted">{t(`h.st.${d.status}.d`)}</p>
          <div className="mt-6 grid grid-cols-4 gap-2.5">
            {actions.map((a) => (
              <div key={a.label} className="flex min-w-0 flex-col items-center gap-2">
                {a.href ? (
                  <motion.span whileTap={{ scale: 0.92 }} className="block w-full">
                    <Link href={a.href} aria-label={a.label} className={`grid h-14 w-full place-items-center rounded-full ${a.primary ? "btn-primary" : "border border-line bg-surface-2"}`}>
                      <Icon name={a.icon} size={22} />
                    </Link>
                  </motion.span>
                ) : (
                  <motion.button whileTap={{ scale: 0.92 }} onClick={a.onClick} aria-label={a.label} aria-busy={exporting} className={`grid h-14 w-full place-items-center rounded-full border border-line bg-surface-2 ${exporting ? "opacity-60" : ""}`}>
                    {exporting ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name={a.icon} size={22} />}
                  </motion.button>
                )}
                <span className="w-full text-center text-[11px] font-semibold leading-tight text-muted [overflow-wrap:anywhere] [hyphens:auto]">{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {!d.deviceConnected && (
        <Link href="/device" className="glass flex items-center gap-4 p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0d0d0f] text-white"><Icon name="device" size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{native ? t("dv.banner.t") : t("dv.web.t")}</span>
            <span className="block text-sm text-muted">{native ? t("dv.banner.b") : t("h.blocked.web")}</span>
          </span>
          <Icon name="chevron" size={18} className="shrink-0 text-muted" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
        <Link href="/apps" className="glass relative overflow-hidden p-4 sm:p-5" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--primary) 38%, transparent), var(--surface))" }}>
          <p className="text-sm font-semibold">{t("h.monitored")}</p>
          <p className="font-display mt-1 text-4xl font-semibold">{num(d.appsMonitored, locale)}</p>
          <div className="mt-4 flex -space-x-3">
            {logos.map((a) => <AppLogo key={a.slug} slug={a.slug} logo={a.logo} name={a.name} size={36} className="ring-2 ring-[var(--bg)]" />)}
            {extra > 0 && <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0d0d0f] text-xs font-bold text-white ring-2 ring-[var(--bg)]">+{extra}</span>}
            {logos.length === 0 && <span className="text-xs text-muted">{t("a.none")}</span>}
          </div>
        </Link>
        <Link href="/wallet" className="glass p-4 sm:p-5" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--good) 26%, transparent), var(--surface))" }}>
          <p className="text-sm font-semibold">{t("h.month")}</p>
          <p className="font-display mt-1 text-3xl font-semibold">{money(d.wallet.month, locale)}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-track">
            <motion.div className="h-full rounded-full bg-good" initial={{ width: 0 }} animate={{ width: d.wallet.lifetime ? `${Math.min(100, (d.wallet.month / d.wallet.lifetime) * 100)}%` : "0%" }} transition={{ duration: 1 }} />
          </div>
          <p className="mt-2 text-xs text-muted">{t("h.pending")}: {money(d.wallet.pending, locale)}</p>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
        <Stat label={t("h.events")} value={num(d.eventsTotal, locale)} />
        {d.deviceConnected ? (
          <Stat label={t("h.blocked")} value={num(d.blockedAttempts, locale)} sub={t("h.blocked.sub")} />
        ) : (
          <Stat label={t("h.blocked")} value={t("c.na")} small sub={native ? t("dv.banner.b") : t("h.blocked.web")} />
        )}
        <Stat label={t("h.stored")} value={bytes(d.dataBytes, locale)} sub={t("h.items", { n: num(d.dataItems, locale) })} />
        <Stat label={t("h.available")} value={money(d.wallet.available, locale)} />
      </div>

      <Card>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{t("h.activity")}</h2>
          <span className="text-xs text-muted">{t("h.last7")}</span>
        </div>
        <Chart data={series} format={(v) => `${num(v, locale)} · ${t("h.events")}`} />
        {series.every((s) => s.value === 0) && <p className="mt-3 text-center text-sm text-muted">{t("h.noact")}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-lg font-bold">{t("h.tx")}</h2>
          <Link href="/wallet" className="max-w-[45%] shrink-0 text-right text-sm font-semibold text-primary">{t("c.view_all")}</Link>
        </div>
        {d.recentTx.length ? <TxList items={d.recentTx} /> : <Empty icon="wallet" title={t("h.tx.empty")} body={t("h.tx.empty.b")} />}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-lg font-bold">{t("h.apps")}</h2>
          <Link href="/protection" className="max-w-[45%] shrink-0 text-right text-sm font-semibold text-primary">{t("c.view_all")}</Link>
        </div>
        {d.recentEvents.length ? <EventList events={d.recentEvents} /> : <Empty icon="apps" title={t("h.apps.empty")} body={t("h.apps.empty.b")} action={<Link href="/apps?add=1" className="font-semibold text-primary">{t("q.add_app")}</Link>} />}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <div className="glass p-4 sm:p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`font-display mt-1 font-semibold ${small ? "text-xl" : "text-3xl"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}
