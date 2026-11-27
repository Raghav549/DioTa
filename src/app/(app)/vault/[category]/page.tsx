"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/components/Providers";
import { Icon } from "@/components/Icon";
import { Button, Card, Confirm, Empty, Field, PageHeader, Pill, Sheet, Skeleton, TextArea } from "@/components/ui";
import { CATEGORY_COLORS, MODES, type Category } from "@/lib/catalog";
import { api, bytes, rel, useApi } from "@/lib/client";
import { CAT_ICON } from "@/components/catIcon";

type Item = { id: string; label: string; content: string; size: number; updatedAt: string };
type Data = { category: Category; mode: string; items: Item[] };

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { t, locale, toast, errText } = useApp();
  const { data, error, reload } = useApi<Data>(`/api/vault/${category}`);
  const [add, setAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delItem, setDelItem] = useState<string | null>(null);
  const [delAll, setDelAll] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);

  if (error) return <><PageHeader title={t("v.title")} back="/vault" /><Card><Empty icon="alert" title={errText(error)} /></Card></>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-36" /><Skeleton className="h-40" /></div>;
  const col = CATEGORY_COLORS[data.category];
  const name = t(`cat.${data.category}`);
  const total = data.items.reduce((s, i) => s + i.size, 0);
  const locked = data.mode === "disabled";

  async function save() {
    if (!label.trim() || !content.trim()) return setFieldErr(t("v.required"));
    setSaving(true);
    try {
      await api(`/api/vault/${category}`, { body: { label: label.trim(), content: content.trim() } });
      setAdd(false);
      setLabel("");
      setContent("");
      setFieldErr(null);
      await reload();
      toast(t("c.saved"));
    } catch (e) {
      setFieldErr(errText(e));
    } finally {
      setSaving(false);
    }
  }
  async function setMode(mode: string) {
    try {
      await api(`/api/vault/${category}`, { method: "PATCH", body: { mode } });
      await reload();
      toast(t("c.saved"));
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  async function remove(item?: string) {
    try {
      await api(`/api/vault/${category}${item ? `?item=${item}` : ""}`, { method: "DELETE" });
      setDelItem(null);
      setDelAll(false);
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(data!.items.map(({ label, content, updatedAt }) => ({ label, content, updatedAt })), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dioTa-${data!.category}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("ex.done"));
  }

  return (
    <div className="space-y-4">
      <PageHeader title={name} back="/vault" />
      <div className="glass flex items-center gap-4 p-5" style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${col.from} 32%, transparent), var(--surface) 75%)` }}>
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl text-white" style={{ background: `linear-gradient(145deg, ${col.from}, ${col.to})` }}><Icon name={CAT_ICON[data.category]} size={28} /></span>
        <div className="min-w-0 flex-1 text-sm">
          <Pill tone="primary" className="mb-1.5"><Icon name="lock" size={12} />{t("v.encrypted")}</Pill>
          <p className="text-2xl font-bold">{t("v.count", { n: data.items.length })}</p>
          <p className="text-muted">{t("v.size")}: {bytes(total, locale)}</p>
          <p className="text-muted">{t("v.value")}: {t("v.value.na")}</p>
        </div>
      </div>

      <Card>
        <h2 className="mb-1 text-lg font-bold">{t("v.mode")}</h2>
        <p className="mb-4 text-sm text-muted">{t("v.consents")}</p>
        <div className="space-y-2.5" role="radiogroup">
          {MODES.map((m) => (
            <button key={m} role="radio" aria-checked={data.mode === m} onClick={() => data.mode !== m && setMode(m)} className={`flex w-full items-start gap-3 rounded-3xl border p-4 text-left transition-colors ${data.mode === m ? "border-primary bg-primary/10" : "border-line bg-surface"}`}>
              <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${data.mode === m ? "btn-primary" : "border border-line"}`}>{data.mode === m && <Icon name="check" size={14} stroke={3} />}</span>
              <span><span className="block font-bold">{t(`m.${m}`)}</span><span className="block text-sm text-muted">{t(`m.${m}.d`)}</span></span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-[3fr_2fr] gap-3">
        <Button full className="min-w-0 !px-4" onClick={() => setAdd(true)} disabled={locked}><Icon name="plus" size={18} />{t("v.add")}</Button>
        <Button variant="soft" className="min-w-0 !px-3" onClick={exportJson} disabled={!data.items.length} aria-label={t("v.export")}><Icon name="download" size={18} />{t("v.export")}</Button>
      </div>
      {locked && <p className="px-2 text-sm text-warn">{t("err.vault_disabled")}</p>}

      <Card>
        {data.items.length === 0 ? (
          <Empty icon="vault" title={t("v.empty")} body={t("v.empty.b")} />
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((i) => (
              <li key={i.id} className="py-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{i.label}</p>
                    <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${reveal === i.id ? "" : "select-none blur-[5px]"}`}>{i.content}</p>
                    <p className="mt-1.5 text-xs text-muted">{rel(i.updatedAt, locale)} · {bytes(i.size, locale)}</p>
                  </div>
                  <button onClick={() => setReveal(reveal === i.id ? null : i.id)} aria-label={reveal === i.id ? t("f.hide") : t("f.show")} className="grid h-10 w-10 place-items-center rounded-full bg-surface-2"><Icon name={reveal === i.id ? "eyeOff" : "eye"} size={18} /></button>
                  <button onClick={() => setDelItem(i.id)} aria-label={t("c.delete")} className="grid h-10 w-10 place-items-center rounded-full bg-bad/12 text-bad"><Icon name="trash" size={18} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.items.length > 0 && <Button variant="danger" full onClick={() => setDelAll(true)}><Icon name="trash" size={18} />{t("v.delete_all")}</Button>}

      <Sheet open={add} onClose={() => setAdd(false)} title={t("v.add.t", { cat: name })}>
        <div className="space-y-4">
          <Field label={t("f.label")} value={label} onChange={(e) => { setLabel(e.target.value); setFieldErr(null); }} maxLength={80} autoFocus />
          <TextArea label={t("f.content")} value={content} onChange={(e) => { setContent(e.target.value); setFieldErr(null); }} maxLength={5000} error={fieldErr} />
          <Button full loading={saving} onClick={save}>{t("c.save")}</Button>
        </div>
      </Sheet>
      <Confirm open={!!delItem} danger title={t("c.delete")} body={t("v.item.q")} confirmLabel={t("c.delete")} onConfirm={() => remove(delItem!)} onClose={() => setDelItem(null)} />
      <Confirm open={delAll} danger title={t("v.delete_all")} body={t("v.delete.q", { cat: name })} confirmLabel={t("c.delete")} onConfirm={() => remove()} onClose={() => setDelAll(false)} />
    </div>
  );
}
