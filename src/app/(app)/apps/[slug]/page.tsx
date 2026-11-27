"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { EventList, dataList, type Ev } from "@/components/Activity";
import type { Caught } from "@/components/InterceptStream";
import { useApp } from "@/components/Providers";
import { AppLogo, Button, Card, Confirm, Empty, PageHeader, Pill, Skeleton, Toggle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { CATEGORIES, PERMISSIONS, SENSITIVE } from "@/lib/catalog";
import { api, bytes, dateFmt, num, rel, useApi } from "@/lib/client";
import { setAppBlocked } from "@/lib/blocking";
import { packageOf, syncPhone } from "@/lib/deviceSync";
import { Phone, isNative, useIsNative } from "@/lib/native";
import type { AppRow } from "../page";

type Detail = { app: Omit<AppRow, "events">; events: Ev[]; intercepts?: (Caught & { category: string; firstAt: string })[] };

export default function AppDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale, toast, errText } = useApp();
  const router = useRouter();
  const { data, error, reload } = useApi<Detail>(`/api/apps/${encodeURIComponent(slug)}`);
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const native = useIsNative();
  const [blocking, setBlocking] = useState(false);

  // Android app: refresh this app's real data from the phone when the page opens.
  useEffect(() => {
    if (!isNative()) return;
    Promise.allSettled([syncPhone(), Phone.flushIntercepts()]).then(() => reload());
  }, [reload]);

  async function block(v: boolean) {
    if (!data) return;
    setBlocking(true);
    try {
      const now = await setAppBlocked(data.app, v);
      await reload();
      toast(t(now ? "a.block.on" : "a.block.off", { app: data.app.name }));
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast(m === "firewall_denied" ? t("a.block.need") : errText(e), "err");
    } finally {
      setBlocking(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/apps/${encodeURIComponent(slug)}`, { method: "PATCH", body });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  async function remove() {
    setRemoving(true);
    try {
      if (data?.app.blocked && isNative()) await setAppBlocked(data.app, false).catch(() => {});
      await api(`/api/apps/${encodeURIComponent(slug)}`, { method: "DELETE" });
      router.replace("/apps");
    } catch (e) {
      toast(errText(e), "err");
      setRemoving(false);
    }
  }

  if (error) return <><PageHeader title={t("a.title")} back="/apps" /><Card><Empty icon="alert" title={errText(error)} /></Card></>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>;
  const a = data.app;
  const name = a.name;
  const fromPhone = a.source === "device";
  const pkg = packageOf(a);
  const caught = data.intercepts ?? [];
  const caughtTotal = caught.reduce((n, c) => n + c.count, 0);
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-4">
      <PageHeader title={name} back="/apps" />
      <Card className="flex items-center gap-4">
        <AppLogo slug={a.slug} logo={a.logo} name={a.name} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Pill tone={a.monitoring ? "good" : "neutral"}>{a.monitoring ? t("a.st.on") : t("a.st.paused")}</Pill>
            <Pill tone={a.needsReview ? "warn" : "good"}>{a.needsReview ? t("a.p.review") : t("a.p.good")}</Pill>
            {fromPhone && <Pill>{t("a.src.device")}</Pill>}
          </div>
          {a.packageName && <p className="mt-2 truncate font-mono text-xs text-muted">{a.packageName}</p>}
          <p className="mt-1 text-sm text-muted">{t("a.last")}: {a.lastObservedAt ? rel(a.lastObservedAt, locale) : t("a.never")}</p>
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

      <Card className={a.blocked ? "!border-bad/40" : ""}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${a.blocked ? "bg-bad/15 text-bad" : "bg-track text-fg"}`}><Icon name="block" size={20} /></span>
            <div className="min-w-0">
              <p className="font-bold">{t("a.block")}</p>
              <p className="text-sm text-muted">{native ? t("a.block.d") : t("a.block.web")}</p>
            </div>
          </div>
          <Toggle checked={a.blocked} disabled={!native || blocking || !pkg} onChange={block} label={t("a.block")} />
        </div>
        {(a.blocked || a.blockedAttempts > 0) && (
          <p className="mt-3 rounded-2xl bg-track/60 px-4 py-2.5 text-sm font-semibold">{t("a.block.attempts", { n: a.blockedAttempts })}</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("a.perms")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{fromPhone ? t("a.perms.real") : t("a.perms.hint")}</p>
        <div className="flex flex-wrap gap-2">
          {PERMISSIONS.map((p) => {
            const on = a.permissions.includes(p);
            const sens = SENSITIVE.includes(p);
            return (
              <button key={p} role="switch" aria-checked={on} disabled={fromPhone} onClick={() => patch({ permissions: toggleIn(a.permissions, p) })} className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-default ${on ? (sens ? "border-warn/50 bg-warn/15 text-warn" : "border-primary bg-primary/15 text-primary") : "border-line bg-surface text-muted"}`}>
                {on && <Icon name="check" size={14} stroke={3} />}
                {t(`perm.${p}`)}
              </button>
            );
          })}
        </div>
        {a.permissions.length === 0 && <p className="mt-3 text-xs text-muted">{t("a.perms.none")}</p>}
        {native && pkg && (
          <Button variant="soft" full className="mt-4" onClick={() => Phone.openAppSettings(pkg).catch((e) => toast(errText(e), "err"))}>
            <Icon name="device" size={18} />{t("a.settings")}
          </Button>
        )}
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
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
          <div>
            <p className="text-xs text-muted">{t("a.volume")}</p>
            <p className="text-sm font-semibold">{a.dataBytes != null ? bytes(a.dataBytes, locale) : native ? t("a.volume.need") : t("a.volume.na")}</p>
            {a.dataBytes != null && <p className="text-[11px] text-muted">{t("a.volume.d")}</p>}
          </div>
          <div><p className="text-xs text-muted">{t("a.lastused")}</p><p className="text-sm font-semibold">{a.lastUsedAt ? rel(a.lastUsedAt, locale) : t("c.na")}</p></div>
          <div><p className="text-xs text-muted">{t("a.events")}</p><p className="text-sm font-semibold">{data.events.length}</p></div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 text-lg font-bold">{t("a.caught")}</h2>
          {caught.length > 0 && <Pill tone="good" className="shrink-0 whitespace-nowrap">{t("a.caught.total", { n: num(caughtTotal, locale) })}</Pill>}
        </div>
        <p className="mt-1 text-sm text-muted">{t("a.caught.d", { app: name })}</p>
        {caught.length ? (
          <ul className="mt-2 divide-y divide-line">
            {caught.map((c) => (
              <li key={c.id} className="flex gap-3.5 py-3.5 [content-visibility:auto] [contain-intrinsic-size:auto_92px]">
                <span className="mt-0.5 grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-bad/12 text-bad"><Icon name="block" size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-snug">
                    {(c.kind === "app" ? t("a.caught.app", { trigger: t(`tg.${c.trigger}`) }) : t("a.caught.t", { data: dataList(t, locale, c.data), trigger: t(`tg.${c.trigger}`) })).replace(/\s{2,}/g, " ").trim()}
                  </p>
                  {c.kind !== "app" && <p className="truncate text-sm text-muted">{c.org} · {c.domain}</p>}
                  <p className="mt-0.5 text-xs font-semibold text-good">{t("a.caught.how", { cat: t(`cat.${c.category}`) })}</p>
                  <p className="text-xs text-muted">{rel(c.at, locale)}{c.count > 1 ? ` · ×${num(c.count, locale)}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="shield" title={t("a.caught.empty")} />
        )}
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
