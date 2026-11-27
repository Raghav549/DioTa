"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EventList, type Ev } from "@/components/Activity";
import { useApp } from "@/components/Providers";
import { AppLogo, Button, Card, Confirm, Empty, PageHeader, Pill, Skeleton, Toggle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CATEGORIES, PERMISSIONS, SENSITIVE, appName } from "@/lib/catalog";
import { api, dateFmt, rel, useApi } from "@/lib/client";
import type { AppRow } from "../page";

type Detail = { app: Omit<AppRow, "events">; events: Ev[] };

export default function AppDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale, toast, errText } = useApp();
  const router = useRouter();
  const { data, error, reload } = useApi<Detail>(`/api/apps/${slug}`);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/apps/${slug}`, { method: "PATCH", body });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  async function remove() {
    setRemoving(true);
    try {
      await api(`/api/apps/${slug}`, { method: "DELETE" });
      router.replace("/apps");
    } catch (e) {
      toast(errText(e), "err");
      setRemoving(false);
    }
  }

  if (error) return <><PageHeader title={t("a.title")} back="/apps" /><Card><Empty icon="alert" title={errText(error)} /></Card></>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>;
  const a = data.app;
  const name = appName(a.slug);
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-4">
      <PageHeader title={name} back="/apps" />
      <Card className="flex items-center gap-4">
        <AppLogo slug={a.slug} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill tone={a.monitoring ? "good" : "neutral"}>{a.monitoring ? t("a.st.on") : t("a.st.paused")}</Pill>
            <Pill tone={a.needsReview ? "warn" : "good"}>{a.needsReview ? t("a.p.review") : t("a.p.good")}</Pill>
          </div>
          <p className="mt-2 text-sm text-muted">{t("a.last")}: {a.lastObservedAt ? rel(a.lastObservedAt, locale) : t("a.never")}</p>
          <p className="text-xs text-muted">{t("a.added")}: {dateFmt(a.addedAt, locale)}</p>
        </div>
      </Card>

      <Card className={a.needsReview ? "!border-warn/40" : ""}>
        <div className="flex gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${a.needsReview ? "bg-warn/15 text-warn" : "bg-good/15 text-good"}`}><Icon name={a.needsReview ? "alert" : "shield"} size={20} /></span>
          <div>
            <p className="font-bold">{t("a.privacy")}: {a.needsReview ? t("a.p.review") : t("a.p.good")}</p>
            <p className="mt-1 text-sm text-muted">{a.needsReview ? t("a.p.review.d") : t("a.p.good.d")}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-bold">{t("a.monitoring")}</p><p className="text-sm text-muted">{t("a.monitoring.d")}</p></div>
          <Toggle checked={a.monitoring} onChange={(v) => patch({ monitoring: v })} label={t("a.monitoring")} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-bold">{t("a.allow")}</p><p className="text-sm text-muted">{t("a.allow.d")}</p></div>
          <Toggle checked={a.allowUse} onChange={(v) => patch({ allowUse: v })} label={t("a.allow")} />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("a.perms")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("a.perms.hint")}</p>
        <div className="flex flex-wrap gap-2">
          {PERMISSIONS.map((p) => {
            const on = a.permissions.includes(p);
            const sens = SENSITIVE.includes(p);
            return (
              <button key={p} role="switch" aria-checked={on} onClick={() => patch({ permissions: toggleIn(a.permissions, p) })} className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${on ? (sens ? "border-warn/50 bg-warn/15 text-warn" : "border-primary bg-primary/15 text-primary") : "border-line bg-surface text-muted"}`}>
                {on && <Icon name="check" size={14} stroke={3} />}
                {t(`perm.${p}`)}
              </button>
            );
          })}
        </div>
        {a.permissions.length === 0 && <p className="mt-3 text-xs text-muted">{t("a.perms.none")}</p>}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("a.cats")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("a.cats.hint")}</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const on = a.dataCategories.includes(c);
            return (
              <button key={c} role="switch" aria-checked={on} onClick={() => patch({ dataCategories: toggleIn(a.dataCategories, c) })} className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${on ? "border-primary bg-primary/15 text-primary" : "border-line bg-surface text-muted"}`}>
                {t(`cat.${c}`)}
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div><p className="text-xs text-muted">{t("a.volume")}</p><p className="text-sm font-semibold">{t("a.volume.na")}</p></div>
          <div><p className="text-xs text-muted">{t("a.events")}</p><p className="text-sm font-semibold">{data.events.length}</p></div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("a.timeline")}</h2>
        {data.events.length ? <EventList events={data.events.map((e) => ({ ...e, appSlug: null }))} /> : <Empty icon="activity" title={t("a.timeline.empty")} />}
      </Card>

      <Button variant="danger" full onClick={() => setConfirm(true)}><Icon name="trash" size={18} />{t("a.remove")}</Button>
      <Confirm open={confirm} danger loading={removing} title={t("a.remove")} body={t("a.remove.q", { app: name })} confirmLabel={t("c.remove")} onConfirm={remove} onClose={() => setConfirm(false)} />
    </div>
  );
}
