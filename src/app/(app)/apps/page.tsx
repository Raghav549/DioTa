"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { AppLogo, Button, Card, Empty, PageHeader, Pill, Sheet, Skeleton, Tabs, Toggle } from "@/components/ui";
import { APPS, appName } from "@/lib/catalog";
import { api, rel, useApi } from "@/lib/client";

export type AppRow = {
  slug: string;
  monitoring: boolean;
  permissions: string[];
  dataCategories: string[];
  allowUse: boolean;
  addedAt: string;
  lastObservedAt: string | null;
  events: number;
  needsReview: boolean;
};

type Filter = "all" | "monitored" | "paused" | "review";
type Sort = "name" | "recent" | "review";

export default function AppsPage() {
  const { t, locale, toast, errText } = useApp();
  const { data, loading, reload } = useApi<{ apps: AppRow[] }>("/api/apps");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add")) setAdding(true);
  }, []);

  const list = useMemo(() => {
    let r = (data?.apps ?? []).filter((a) => appName(a.slug).toLowerCase().includes(q.trim().toLowerCase()));
    if (filter === "monitored") r = r.filter((a) => a.monitoring);
    if (filter === "paused") r = r.filter((a) => !a.monitoring);
    if (filter === "review") r = r.filter((a) => a.needsReview);
    return [...r].sort((a, b) =>
      sort === "name"
        ? appName(a.slug).localeCompare(appName(b.slug))
        : sort === "recent"
          ? (b.lastObservedAt ?? "").localeCompare(a.lastObservedAt ?? "")
          : Number(b.needsReview) - Number(a.needsReview),
    );
  }, [data, q, filter, sort]);

  const addable = APPS.filter((a) => !data?.apps.some((x) => x.slug === a.slug));

  async function add(slug: string) {
    setBusy(slug);
    try {
      await api("/api/apps", { body: { slug } });
      await reload();
      toast(t("ev.app_added", { app: appName(slug) }));
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(null);
    }
  }
  async function toggle(slug: string, monitoring: boolean) {
    try {
      await api(`/api/apps/${slug}`, { method: "PATCH", body: { monitoring } });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }

  return (
    <div>
      <PageHeader title={t("a.title")} right={<Button onClick={() => setAdding(true)} className="!px-4 !py-2.5"><Icon name="plus" size={18} />{t("a.add")}</Button>} />
      <div className="relative mb-4">
        <Icon name="search" size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("a.search")} aria-label={t("a.search")} className="input !pl-12" enterKeyHint="search" />
      </div>
      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { id: "all", label: t("a.f.all") },
          { id: "monitored", label: t("a.f.monitored") },
          { id: "paused", label: t("a.f.paused") },
          { id: "review", label: t("a.f.review") },
        ]}
      />
      <div className="mb-4 mt-4 flex justify-end">
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("a.s.name")} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg outline-none">
          <option value="name">{t("a.s.name")}</option>
          <option value="recent">{t("a.s.recent")}</option>
          <option value="review">{t("a.s.review")}</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : !data?.apps.length ? (
        <Card><Empty icon="apps" title={t("a.none")} body={t("a.none.b")} action={<Button onClick={() => setAdding(true)}>{t("a.add")}</Button>} /></Card>
      ) : !list.length ? (
        <Card><Empty icon="search" title={t("a.empty")} /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((a, i) => (
            <motion.div key={a.slug} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="glass flex items-center gap-3 p-4">
              <Link href={`/apps/${a.slug}`} className="flex min-w-0 flex-1 items-center gap-4">
                <AppLogo slug={a.slug} size={54} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{appName(a.slug)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Pill tone={a.monitoring ? "good" : "neutral"}>{a.monitoring ? t("a.st.on") : t("a.st.paused")}</Pill>
                    <Pill tone={a.needsReview ? "warn" : "neutral"}>{a.needsReview ? t("a.p.review") : t("a.p.good")}</Pill>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {t("a.last")}: {a.lastObservedAt ? rel(a.lastObservedAt, locale) : t("a.never")}
                  </p>
                </div>
              </Link>
              <Toggle checked={a.monitoring} onChange={(v) => toggle(a.slug, v)} label={t("a.monitoring")} />
            </motion.div>
          ))}
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={t("a.add.t")}>
        <p className="mb-4 text-sm text-muted">{t("a.add.b")}</p>
        {addable.length === 0 ? (
          <p className="py-6 text-center text-muted">{t("a.add.none")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {addable.map((a) => (
              <button key={a.slug} onClick={() => add(a.slug)} disabled={busy === a.slug} className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-3 transition-transform active:scale-95 disabled:opacity-50">
                <AppLogo slug={a.slug} size={52} />
                <span className="w-full truncate text-center text-xs font-semibold">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
