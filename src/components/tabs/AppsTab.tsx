"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { AppLogo, Button, Card, Empty, PageHeader, Pill, Sheet, Skeleton, Tabs, Toggle } from "@/components/ui";
import type { PublicApp } from "@/lib/apps";
import { APPS, SENSITIVE } from "@/lib/catalog";
import { api, bytes, rel, useApi } from "@/lib/client";
import { syncPhone } from "@/lib/deviceSync";
import { mapAndroidPermissions } from "@/lib/android";
import { Phone, useIsNative, type PhoneApp } from "@/lib/native";

export type AppRow = PublicApp;

type Filter = "all" | "monitored" | "paused" | "review" | "blocked";
type Sort = "name" | "recent" | "review" | "data";

export default function AppsPage() {
  const { t, locale, toast, errText } = useApp();
  const { data, loading, reload } = useApi<{ apps: AppRow[] }>("/api/apps");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(() => !!searchParams.get("add"));
  const [busy, setBusy] = useState<string | null>(null);
  const native = useIsNative();
  const [scanOpen, setScanOpen] = useState(() => !!searchParams.get("scan"));

  const list = useMemo(() => {
    let r = (data?.apps ?? []).filter((a) => a.name.toLowerCase().includes(q.trim().toLowerCase()) || (a.packageName ?? "").includes(q.trim().toLowerCase()));
    if (filter === "monitored") r = r.filter((a) => a.monitoring);
    if (filter === "paused") r = r.filter((a) => !a.monitoring);
    if (filter === "review") r = r.filter((a) => a.needsReview);
    if (filter === "blocked") r = r.filter((a) => a.blocked);
    return [...r].sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "recent"
          ? (b.lastUsedAt ?? b.lastObservedAt ?? "").localeCompare(a.lastUsedAt ?? a.lastObservedAt ?? "")
          : sort === "data"
            ? (b.dataBytes ?? -1) - (a.dataBytes ?? -1)
            : Number(b.needsReview) - Number(a.needsReview),
    );
  }, [data, q, filter, sort]);

  const addable = APPS.filter((a) => !data?.apps.some((x) => x.slug === a.slug));

  async function add(slug: string, name: string) {
    setBusy(slug);
    try {
      await api("/api/apps", { body: { slug } });
      // In the Android app, fill in the real permissions/data use right away.
      if (native) await syncPhone().catch(() => {});
      await reload();
      toast(t("ev.app_added", { app: name }));
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(null);
    }
  }
  async function toggle(slug: string, monitoring: boolean) {
    try {
      await api(`/api/apps/${encodeURIComponent(slug)}`, { method: "PATCH", body: { monitoring } });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }

  const addButton = native ? (
    <Button onClick={() => setScanOpen(true)} className="max-w-[11rem] !px-4 !py-2.5"><Icon name="scan" size={18} className="shrink-0" /><span className="truncate">{t("sc.btn")}</span></Button>
  ) : (
    <Button onClick={() => setAdding(true)} className="max-w-[10rem] !px-4 !py-2.5"><Icon name="plus" size={18} className="shrink-0" /><span className="truncate">{t("a.add")}</span></Button>
  );

  return (
    <div>
      <PageHeader title={t("a.title")} right={addButton} />
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
          { id: "review", label: t("a.f.review") },
          { id: "blocked", label: t("a.block") },
          { id: "paused", label: t("a.f.paused") },
        ]}
      />
      <div className="mb-4 mt-4 flex items-center justify-between gap-3">
        {native ? (
          <button onClick={() => setAdding(true)} className="truncate text-sm font-semibold text-muted underline underline-offset-4">{t("sc.manual")}</button>
        ) : <span />}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("a.s.name")} className="max-w-[60%] truncate rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg outline-none">
          <option value="name">{t("a.s.name")}</option>
          <option value="recent">{t("a.s.recent")}</option>
          <option value="data">{t("a.volume")}</option>
          <option value="review">{t("a.s.review")}</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : !data?.apps.length ? (
        <Card><Empty icon="apps" title={t("a.none")} body={t("a.none.b")} action={native ? <Button onClick={() => setScanOpen(true)}><Icon name="scan" size={18} />{t("sc.btn")}</Button> : <Button onClick={() => setAdding(true)}>{t("a.add")}</Button>} /></Card>
      ) : !list.length ? (
        <Card><Empty icon="search" title={t("a.empty")} /></Card>
      ) : (
        <div className="space-y-3">
          {list.map((a, i) => (
            <div key={a.slug} className="rise glass flex items-center gap-3 p-4 [content-visibility:auto] [contain-intrinsic-size:auto_86px]" style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, ["--rise" as string]: "12px" }}>
              <Link href={`/apps/${encodeURIComponent(a.slug)}`} className="flex min-w-0 flex-1 items-center gap-4">
                <AppLogo slug={a.slug} logo={a.logo} name={a.name} size={54} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{a.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.blocked ? <Pill tone="bad">{t("a.block")}</Pill> : <Pill tone={a.monitoring ? "good" : "neutral"}>{a.monitoring ? t("a.st.on") : t("a.st.paused")}</Pill>}
                    <Pill tone={a.needsReview ? "warn" : "neutral"}>{a.needsReview ? t("a.p.review") : t("a.p.good")}</Pill>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {a.dataBytes != null ? `${bytes(a.dataBytes, locale)} · ` : ""}
                    {a.lastUsedAt ? `${t("a.lastused")}: ${rel(a.lastUsedAt, locale)}` : `${t("a.last")}: ${a.lastObservedAt ? rel(a.lastObservedAt, locale) : t("a.never")}`}
                  </p>
                </div>
              </Link>
              <Toggle checked={a.monitoring} onChange={(v) => toggle(a.slug, v)} label={t("a.monitoring")} />
            </div>
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
              <button key={a.slug} onClick={() => add(a.slug, a.name)} disabled={busy === a.slug} className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface p-3 transition-transform active:scale-95 disabled:opacity-50">
                <AppLogo slug={a.slug} size={52} />
                <span className="w-full truncate text-center text-xs font-semibold">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      {native && <ScanSheet open={scanOpen && native} onClose={() => setScanOpen(false)} tracked={data?.apps ?? []} onDone={reload} />}
    </div>
  );
}

/** Lists the apps that are really installed on this phone so the user can pick which ones to track. */
function ScanSheet({ open, onClose, tracked, onDone }: { open: boolean; onClose: () => void; tracked: AppRow[]; onDone: () => Promise<void> | void }) {
  const { t, locale, toast, errText } = useApp();
  const [system, setSystem] = useState(false);
  const [scan, setScan] = useState<{ system: boolean; apps: PhoneApp[] } | null>(null);
  const apps = open && scan && scan.system === system ? scan.apps : null;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    Phone.listApps({ includeSystem: system, icons: true })
      .then((r) => alive && setScan({ system, apps: r.apps.sort((a, b) => a.label.localeCompare(b.label)) }))
      .catch((e) => {
        if (!alive) return;
        setScan({ system, apps: [] });
        toast(errText(e), "err");
      });
    return () => {
      alive = false;
    };
  }, [open, system, toast, errText]);

  const trackedPkgs = useMemo(() => new Set(tracked.map((a) => a.packageName ?? APPS.find((c) => c.slug === a.slug)?.pkg ?? a.slug)), [tracked]);
  const shown = (apps ?? []).filter((a) => !filter || a.label.toLowerCase().includes(filter.toLowerCase()));
  const selectable = shown.filter((a) => !trackedPkgs.has(a.pkg));

  async function track() {
    if (!apps) return;
    setSaving(true);
    try {
      const pick = apps.filter((a) => sel.has(a.pkg));
      const r = await syncPhone(pick);
      await onDone();
      toast(t("sc.done", { n: r.added }));
      setSel(new Set());
      onClose();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !saving && onClose()} title={t("sc.title")}>
      <p className="mb-3 text-sm text-muted">{t("sc.b")}</p>
      <div className="relative mb-3">
        <Icon name="search" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("a.search")} aria-label={t("a.search")} className="input !py-3 !pl-11" />
      </div>
      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">
          <Toggle checked={system} onChange={setSystem} label={t("sc.system")} />
          <span className="truncate">{t("sc.system")}</span>
        </label>
        <div className="flex shrink-0 gap-3 font-semibold">
          <button onClick={() => setSel(new Set([...sel, ...selectable.map((a) => a.pkg)]))}>{t("sc.all")}</button>
          <button className="text-muted" onClick={() => setSel(new Set())}>{t("sc.none")}</button>
        </div>
      </div>
      {!apps ? (
        <div className="flex flex-col items-center gap-3 py-10 text-muted">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {t("sc.scanning")}
        </div>
      ) : !shown.length ? (
        <p className="py-8 text-center text-muted">{t("sc.empty")}</p>
      ) : (
        <ul className="-mx-2 max-h-[48dvh] divide-y divide-line overflow-y-auto">
          {shown.map((a) => {
            const isTracked = trackedPkgs.has(a.pkg);
            const on = sel.has(a.pkg);
            const sens = mapAndroidPermissions(a.granted).filter((p) => SENSITIVE.includes(p)).length;
            return (
              <li key={a.pkg}>
                <button
                  disabled={isTracked}
                  onClick={() => setSel((s) => { const n = new Set(s); if (n.has(a.pkg)) n.delete(a.pkg); else n.add(a.pkg); return n; })}
                  className="flex w-full items-center gap-3 px-2 py-3 text-left disabled:opacity-60"
                  role="checkbox"
                  aria-checked={on || isTracked}
                >
                  {a.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.icon} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[28%]" />
                  ) : (
                    <AppLogo slug={a.pkg} name={a.label} size={40} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.label}</span>
                    <span className="block truncate text-xs text-muted">
                      {sens > 0 ? t("sc.sensitive", { n: sens }) + " · " : ""}
                      {a.dataBytes != null ? bytes(a.dataBytes, locale) : a.pkg}
                    </span>
                  </span>
                  {isTracked ? (
                    <span className="shrink-0 text-xs font-semibold text-muted">{t("sc.tracked")}</span>
                  ) : (
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ${on ? "border-[#0d0d0f] bg-[#0d0d0f] text-white dark:border-white dark:bg-white dark:text-black" : "border-line"}`}>
                      {on && <Icon name="check" size={14} stroke={3} />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button full className="mt-4" loading={saving} disabled={!sel.size} onClick={track}>
        {t("sc.track", { n: sel.size })}
      </Button>
    </Sheet>
  );
}
