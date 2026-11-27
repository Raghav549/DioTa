"use client";
import { useMemo, useState } from "react";
import { TxList, type Tx } from "@/components/Activity";
import { Chart } from "@/components/Chart";
import { Icon } from "@/components/Icon";
import { PaymentMethods, type Method } from "@/components/PaymentMethods";
import { useApp } from "@/components/Providers";
import { Button, Card, Confirm, Empty, Field, PageHeader, Sheet, Skeleton } from "@/components/ui";
import { api, dateFmt, money, num, useApi } from "@/lib/client";

type W = {
  lifetime: number;
  month: number;
  pending: number;
  available: number;
  verifiedCount: number;
  transactions: Tx[];
  rewards: { amountPaise: number; createdAt: string }[];
  methods: Method[];
  payoutsAvailable: boolean;
  rewardsActive: boolean;
};

export default function WalletPage() {
  const { t, locale, toast, errText } = useApp();
  const { data: w, error, reload } = useApi<W>("/api/wallet");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const series = useMemo(() => {
    if (!w) return [];
    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (29 - i));
      const end = new Date(day);
      end.setDate(end.getDate() + 1);
      const value = w.rewards.filter((r) => { const d = new Date(r.createdAt); return d >= day && d < end; }).reduce((s, r) => s + r.amountPaise, 0);
      return { label: dateFmt(day.toISOString(), locale, { day: "numeric", month: "short" }), value };
    });
  }, [w, locale]);

  if (error) return <Card><Empty icon="alert" title={errText(error)} /></Card>;
  if (!w) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-32" /><Skeleton className="h-56" /></div>;

  const verified = w.methods.filter((m) => m.status === "verified");
  const blocked = !w.payoutsAvailable ? t("w.wd.unavailable") : w.available <= 0 ? t("w.wd.nobalance") : verified.length === 0 ? t("err.no_verified_method") : null;
  const withdrawals = w.transactions.filter((x) => x.type === "withdrawal");

  function review() {
    const v = Number(amount.replace(",", "."));
    if (!method) return setMsg(t("err.no_verified_method"));
    if (!(v > 0)) return setMsg(t("v.required"));
    if (Math.round(v * 100) > w!.available) return setMsg(t("err.no_balance"));
    setMsg(null);
    setConfirm(true);
  }
  async function submit() {
    setBusy(true);
    try {
      await api("/api/wallet/withdraw", { body: { methodId: method, amount: Number(amount.replace(",", ".")) } });
      setConfirm(false);
      setOpen(false);
      setAmount("");
      await reload();
      toast(t("w.wd.done"));
    } catch (e) {
      setConfirm(false);
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("w.title")} />
      <section className="rise glass relative overflow-hidden p-6" style={{ background: "linear-gradient(150deg, color-mix(in srgb, var(--primary) 30%, transparent), var(--surface) 70%)" }}>
        <p className="text-sm font-semibold text-muted">{t("w.balance")}</p>
        <p className="font-display mt-1 text-5xl font-semibold tracking-tight">{money(w.available, locale)}</p>
        <div className="mt-6 flex gap-3">
          <Button full onClick={() => { setMsg(blocked); setOpen(true); }}><Icon name="up" size={18} />{t("w.withdraw")}</Button>
        </div>
      </section>

      {!w.rewardsActive && w.lifetime === 0 && (
        <Card className="!border-warn/40">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn"><Icon name="alert" size={20} /></span>
            <div><p className="font-bold">{t("w.status.t")}</p><p className="mt-1 text-sm text-muted">{t("w.status.b")}</p></div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">
        {[
          [t("w.lifetime"), money(w.lifetime, locale)],
          [t("w.month"), money(w.month, locale)],
          [t("w.pending"), money(w.pending, locale)],
          [t("w.verified"), num(w.verifiedCount, locale)],
          [t("w.withdrawals"), num(withdrawals.length, locale)],
        ].map(([l, v]) => (
          <div key={l} className="glass p-5"><p className="text-sm text-muted">{l}</p><p className="font-display mt-1 text-2xl font-semibold">{v}</p></div>
        ))}
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-bold">{t("w.chart")}</h2>
        <Chart data={series} format={(v) => money(v, locale)} />
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-bold">{t("w.methods")}</h2>
        <PaymentMethods methods={w.methods} payoutsAvailable={w.payoutsAvailable} onChange={reload} />
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("w.partner")}</h2>
        <p className="mt-1 text-sm text-muted">{t("w.partner.b")}</p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">{t("w.history")}</h2>
        {w.transactions.length ? <TxList items={w.transactions} /> : <Empty icon="wallet" title={t("tx.empty")} body={t("tx.empty.b")} />}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("w.wd.t")}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("w.balance")}: <b className="text-fg">{money(w.available, locale)}</b></p>
          <Field label={t("w.wd.amount")} value={amount} onChange={(e) => { setAmount(e.target.value); setMsg(null); }} inputMode="decimal" disabled={!!blocked} />
          <div>
            <label className="mb-2 block text-sm font-semibold text-muted" htmlFor="wd-method">{t("w.wd.method")}</label>
            <select id="wd-method" value={method} onChange={(e) => setMethod(e.target.value)} disabled={!!blocked} className="input">
              <option value="">—</option>
              {verified.map((m) => <option key={m.id} value={m.id}>{m.display}</option>)}
            </select>
          </div>
          {msg && <p role="alert" className="text-sm font-medium text-warn">{msg}</p>}
          <Button full disabled={!!blocked} onClick={review}>{t("w.withdraw")}</Button>
        </div>
      </Sheet>
      <Confirm open={confirm} loading={busy} title={t("w.wd.t")} body={t("w.wd.q", { amount: money(Math.round(Number(amount.replace(",", ".")) * 100) || 0, locale), method: w.methods.find((m) => m.id === method)?.display ?? "" })} onConfirm={submit} onClose={() => setConfirm(false)} />
    </div>
  );
}
