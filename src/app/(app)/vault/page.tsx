"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { CAT_ICON } from "@/components/catIcon";
import { useApp } from "@/components/Providers";
import { Card, Empty, PageHeader, Pill, Skeleton } from "@/components/ui";
import { CATEGORY_COLORS, type Category } from "@/lib/catalog";
import { bytes, num, rel, useApi } from "@/lib/client";

type Row = { category: Category; items: number; bytes: number; updatedAt: string | null; mode: string };

export default function VaultPage() {
  const { t, locale, errText } = useApp();
  const { data, error } = useApi<{ categories: Row[] }>("/api/vault");
  if (error) return <Card><Empty icon="alert" title={errText(error)} /></Card>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>;
  const total = data.categories.reduce((s, c) => s + c.bytes, 0);
  const items = data.categories.reduce((s, c) => s + c.items, 0);

  return (
    <div>
      <PageHeader title={t("v.title")} />
      <Card className="mb-5 flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full btn-primary"><Icon name="lock" size={26} /></span>
        <div className="flex-1">
          <p className="text-sm text-muted">{t("v.total")}</p>
          <p className="font-display text-3xl font-semibold">{bytes(total, locale)}</p>
          <p className="text-xs text-muted">{t("h.items", { n: num(items, locale) })} · {t("v.encrypted")}</p>
        </div>
      </Card>
      <p className="mb-4 px-1 text-sm text-muted">{t("v.sub")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.categories.map((c, i) => {
          const col = CATEGORY_COLORS[c.category];
          const share = total ? c.bytes / total : 0;
          const R = 22;
          const C = 2 * Math.PI * R;
          return (
            <motion.div key={c.category} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link href={`/vault/${c.category}`} className="glass relative block overflow-hidden p-5" style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${col.from} 26%, transparent), var(--surface) 70%)` }}>
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(145deg, ${col.from}, ${col.to})` }}>
                    <Icon name={CAT_ICON[c.category]} size={22} />
                  </span>
                  <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
                    <circle cx="28" cy="28" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
                    <motion.circle cx="28" cy="28" r={R} fill="none" stroke={col.from} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - share) }} transition={{ duration: 1, delay: 0.2 }} transform="rotate(-90 28 28)" />
                  </svg>
                </div>
                <h2 className="mt-4 text-xl font-bold">{t(`cat.${c.category}`)}</h2>
                <p className="text-sm text-muted">{t("v.count", { n: num(c.items, locale) })} · {bytes(c.bytes, locale)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Pill tone={c.mode === "selected" ? "good" : c.mode === "disabled" ? "bad" : "neutral"}>{t(`m.${c.mode}`)}</Pill>
                </div>
                <div className="mt-3 space-y-0.5 text-xs text-muted">
                  <p>{t("v.updated")}: {c.updatedAt ? rel(c.updatedAt, locale) : t("v.never")}</p>
                  <p>{t("v.value")}: {t("v.value.na")}</p>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
