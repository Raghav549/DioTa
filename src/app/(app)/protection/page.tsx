"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { EventList, type Ev } from "@/components/Activity";
import { Icon, type IconName } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Card, Empty, PageHeader, Pill, Skeleton, Toggle } from "@/components/ui";
import { api, num, useApi } from "@/lib/client";

type Dash = { status: string; protectionEnabled: boolean; monitoringEnabled: boolean; appsMonitored: number; appsTotal: number; alerts: number; eventsTotal: number };

const noopSubscribe = () => () => {};

function Item({ icon, title, value, tone = "neutral" }: { icon: IconName; title: string; value: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <li className="flex items-center gap-3.5 py-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon name={icon} size={20} /></span>
      <span className="flex-1 font-semibold">{title}</span>
      <Pill tone={tone}>{value}</Pill>
    </li>
  );
}

export default function ProtectionPage() {
  const { t, locale, toast, errText } = useApp();
  const { data: d, reload } = useApi<Dash>("/api/dashboard");
  const { data: v } = useApi<{ categories: { mode: string }[] }>("/api/vault");
  const { data: ev } = useApi<{ events: Ev[] }>("/api/events");
  const secure = useSyncExternalStore(noopSubscribe, () => window.isSecureContext, () => null);

  async function patch(body: Record<string, boolean>) {
    try {
      await api("/api/me", { method: "PATCH", body });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  if (!d) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const shared = v?.categories.filter((c) => c.mode === "selected").length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader title={t("p.title")} back="/home" />
      <p className="px-1 text-muted">{t("p.sub")}</p>
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-bold">{t("p.master")}</p><p className="text-sm text-muted">{t("p.master.d")}</p></div>
          <Toggle checked={d.protectionEnabled} onChange={(x) => patch({ protectionEnabled: x })} label={t("p.master")} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-bold">{t("p.monitor")}</p><p className="text-sm text-muted">{t("p.monitor.d")}</p></div>
          <Toggle checked={d.monitoringEnabled} onChange={(x) => patch({ monitoringEnabled: x })} label={t("p.monitor")} />
        </div>
      </Card>

      <Card>
        <ul className="divide-y divide-line">
          <Item icon="apps" title={t("p.apps")} value={num(d.appsMonitored, locale)} tone="good" />
          <Item icon="activity" title={t("p.events")} value={num(d.eventsTotal, locale)} />
          <Item icon="alert" title={t("p.alerts")} value={d.alerts ? t("p.alerts.n", { n: d.alerts }) : t("p.alerts.none")} tone={d.alerts ? "warn" : "good"} />
          <Item icon="wifi" title={t("p.network")} value={t("p.network.na")} />
          <Item icon="shield" title={t("p.blocked")} value={t("h.blocked.na")} />
          <Item icon="vault" title={t("p.sharing")} value={t("p.sharing.n", { n: shared, total: v?.categories.length ?? 7 })} />
          <Item icon="device" title={`${t("p.device")} · ${t("p.secure")}`} value={secure === null ? "…" : secure ? t("p.yes") : t("p.no")} tone={secure ? "good" : "warn"} />
        </ul>
        {d.alerts > 0 && <Link href="/apps" className="mt-2 block text-center font-semibold text-primary">{t("p.review")}</Link>}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("p.honest.t")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t("p.honest.b")}</p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("p.recent")}</h2>
        {ev?.events.length ? <EventList events={ev.events.slice(0, 10)} /> : <Empty icon="activity" title={t("p.recent.empty")} />}
      </Card>
    </div>
  );
}
