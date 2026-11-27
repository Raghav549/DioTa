"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Confirm, Empty, Field, Pill, Sheet, Tabs } from "@/components/ui";
import { api } from "@/lib/client";

export type Method = { id: string; kind: "upi" | "bank"; display: string; status: string };

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z][a-z0-9]{1,30}$/i;

export function PaymentMethods({ methods, payoutsAvailable, onChange }: { methods: Method[]; payoutsAvailable: boolean; onChange: () => void }) {
  const { t, toast, errText } = useApp();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"upi" | "bank">("upi");
  const [f, setF] = useState({ upi: "", holder: "", account: "", ifsc: "" });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rm, setRm] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);

  async function add() {
    if (kind === "upi" && !UPI_RE.test(f.upi.trim())) return setErr(t("v.upi"));
    if (kind === "bank") {
      if (f.holder.trim().length < 2) return setErr(t("v.name"));
      if (!/^\d{9,18}$/.test(f.account.trim())) return setErr(t("v.account"));
      if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(f.ifsc.trim())) return setErr(t("v.ifsc"));
    }
    setSaving(true);
    try {
      await api("/api/wallet/methods", { body: kind === "upi" ? { kind, upi: f.upi.trim() } : { kind, holder: f.holder.trim(), account: f.account.trim(), ifsc: f.ifsc.trim() } });
      setOpen(false);
      setF({ upi: "", holder: "", account: "", ifsc: "" });
      setErr(null);
      onChange();
      toast(t("c.saved"));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setSaving(false);
    }
  }
  async function verify(id: string) {
    setVerifying(id);
    try {
      await api(`/api/wallet/methods/${id}/verify`, { method: "POST" });
      onChange();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setVerifying(null);
    }
  }
  async function remove() {
    try {
      await api(`/api/wallet/methods/${rm}`, { method: "DELETE" });
      setRm(null);
      onChange();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  const upd = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setErr(null);
  };

  return (
    <div>
      {methods.length === 0 ? (
        <Empty icon="bank" title={t("pm.none")} />
      ) : (
        <ul className="divide-y divide-line">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon name={m.kind === "upi" ? "wallet" : "bank"} size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.display}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span>{t(`pm.${m.kind}`)}</span>
                  <Pill tone={m.status === "verified" ? "good" : m.status === "failed" ? "bad" : "neutral"}>{t(`pm.s.${m.status}`)}</Pill>
                </div>
              </div>
              {m.status !== "verified" && <Button variant="soft" className="!px-4 !py-2 text-sm" loading={verifying === m.id} onClick={() => verify(m.id)}>{t("pm.verify")}</Button>}
              <button onClick={() => setRm(m.id)} aria-label={t("c.remove")} className="grid h-10 w-10 place-items-center rounded-full bg-bad/12 text-bad"><Icon name="trash" size={17} /></button>
            </li>
          ))}
        </ul>
      )}
      {methods.length > 0 && !payoutsAvailable && <p className="mt-2 text-xs text-muted">{t("pm.unavailable")}</p>}
      <Button variant="soft" full className="mt-3" onClick={() => setOpen(true)}><Icon name="plus" size={18} />{t("w.add_method")}</Button>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("w.add_method")}>
        <Tabs value={kind} onChange={(k) => { setKind(k); setErr(null); }} options={[{ id: "upi", label: t("pm.upi") }, { id: "bank", label: t("pm.bank") }]} />
        <div className="mt-5 space-y-4">
          {kind === "upi" ? (
            <Field label={t("f.upi")} value={f.upi} onChange={upd("upi")} placeholder="name@bank" autoCapitalize="none" autoComplete="off" error={err} maxLength={96} />
          ) : (
            <>
              <Field label={t("f.holder")} value={f.holder} onChange={upd("holder")} autoComplete="off" maxLength={80} />
              <Field label={t("f.account")} value={f.account} onChange={upd("account")} inputMode="numeric" autoComplete="off" maxLength={18} />
              <Field label={t("f.ifsc")} value={f.ifsc} onChange={upd("ifsc")} autoCapitalize="characters" autoComplete="off" maxLength={11} error={err} />
            </>
          )}
          <p className="text-xs text-muted">{t("pm.unavailable")}</p>
          <Button full loading={saving} onClick={add}>{t("c.save")}</Button>
        </div>
      </Sheet>
      <Confirm open={!!rm} danger title={t("c.remove")} body={t("pm.remove.q")} confirmLabel={t("c.remove")} onConfirm={remove} onClose={() => setRm(null)} />
    </div>
  );
}
