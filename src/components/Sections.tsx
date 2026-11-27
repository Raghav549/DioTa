"use client";
import { useState, type ComponentType } from "react";
import { Icon } from "@/components/Icon";
import { LanguagePicker } from "@/components/LanguagePicker";
import { PaymentMethods, type Method } from "@/components/PaymentMethods";
import { useApp } from "@/components/Providers";
import { RecoveryKey } from "@/components/RecoveryKey";
import { Button, Card, Confirm, Empty, Field, Sheet, Skeleton, TextArea, Toggle } from "@/components/ui";
import { THEMES, type Theme } from "@/lib/catalog";
import { api, dateFmt, rel, useApi } from "@/lib/client";
import { PHONE_RE, cleanPhone, passwordOk } from "@/lib/rules";

type Me = { id: string; name: string; email: string; phone: string | null; protectionEnabled: boolean; monitoringEnabled: boolean; notifPrefs: { alerts: boolean; activity: boolean; rewards: boolean; security: boolean }; createdAt: string };
const useMe = () => useApi<{ user: Me }>("/api/me");

function ProfileSection() {
  const { t, toast, errText } = useApp();
  const { data, reload } = useMe();
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Skeleton className="h-64" />;
  const u = data.user;
  const n = name ?? u.name;
  const p = phone ?? u.phone ?? "";
  async function save() {
    if (n.trim().length < 2) return setErr(t("v.name"));
    if (p.trim() && !PHONE_RE.test(cleanPhone(p))) return setErr(t("v.phone"));
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: { name: n.trim(), phone: p.trim() ? cleanPhone(p) : "" } });
      await reload();
      setErr(null);
      toast(t("c.saved"));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4">
      <Field label={t("f.name")} value={n} onChange={(e) => { setName(e.target.value); setErr(null); }} maxLength={80} autoComplete="name" />
      <Field label={t("f.email")} value={u.email} disabled readOnly />
      <Field label={`${t("f.phone")} (${t("c.optional")})`} value={p} onChange={(e) => { setPhone(e.target.value); setErr(null); }} inputMode="tel" maxLength={20} error={err} />
      <Button full loading={busy} onClick={save}>{t("c.save")}</Button>
    </Card>
  );
}

function AccountSection() {
  const { t, locale } = useApp();
  const { data } = useMe();
  if (!data) return <Skeleton className="h-48" />;
  const u = data.user;
  const rows: [string, string][] = [[t("f.email"), u.email], [t("f.phone"), u.phone ?? t("c.na")], [t("s.member"), dateFmt(u.createdAt, locale)]];
  return (
    <Card>
      <ul className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-4 py-4"><span className="text-muted">{k}</span><span className="truncate font-semibold">{v}</span></li>
        ))}
      </ul>
    </Card>
  );
}

const LanguageSection = () => <LanguagePicker />;

function ThemeSection() {
  const { t, theme, setTheme } = useApp();
  const icon = { light: "sun", dark: "moon", system: "device" } as const;
  return (
    <>
      <p className="px-1 text-muted">{t("th.b")}</p>
      <div className="grid grid-cols-3 gap-3" role="radiogroup">
        {THEMES.map((x: Theme) => (
          <button key={x} role="radio" aria-checked={theme === x} onClick={() => setTheme(x)} className={`flex flex-col items-center gap-3 rounded-3xl border p-5 transition-colors ${theme === x ? "border-primary bg-primary/12" : "border-line bg-surface"}`}>
            <span className={`grid h-12 w-12 place-items-center rounded-full ${theme === x ? "btn-primary" : "bg-surface-2"}`}><Icon name={icon[x]} size={22} /></span>
            <span className="text-sm font-semibold">{t(`th.${x}`)}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function SecuritySection() {
  const { t, toast, errText } = useApp();
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rkOpen, setRkOpen] = useState(false);
  const [rkPw, setRkPw] = useState("");
  const [rkErr, setRkErr] = useState<string | null>(null);
  const [rkBusy, setRkBusy] = useState(false);
  const [rk, setRk] = useState<string | null>(null);

  async function change() {
    if (!cur) return setErr(t("v.required"));
    if (!passwordOk(nw)) return setErr(t("v.pw"));
    if (nw !== cf) return setErr(t("v.match"));
    setBusy(true);
    try {
      await api("/api/me/password", { body: { current: cur, next: nw } });
      setCur(""); setNw(""); setCf(""); setErr(null);
      toast(t("sec.changed"));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  async function newKey() {
    if (!rkPw) return setRkErr(t("v.required"));
    setRkBusy(true);
    try {
      const r = await api<{ recoveryKey: string }>("/api/me/recovery", { body: { password: rkPw } });
      setRk(r.recoveryKey);
      setRkPw("");
      setRkErr(null);
    } catch (e) {
      setRkErr(errText(e));
    } finally {
      setRkBusy(false);
    }
  }
  return (
    <>
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">{t("sec.change")}</h2>
        <Field label={t("f.current")} type="password" value={cur} onChange={(e) => { setCur(e.target.value); setErr(null); }} autoComplete="current-password" maxLength={128} />
        <Field label={t("f.newpw")} type="password" value={nw} onChange={(e) => { setNw(e.target.value); setErr(null); }} autoComplete="new-password" maxLength={128} hint={`${t("pw.len")} · ${t("pw.mix")} · ${t("pw.num")} · ${t("pw.sym")}`} />
        <Field label={t("f.confirm")} type="password" value={cf} onChange={(e) => { setCf(e.target.value); setErr(null); }} autoComplete="new-password" maxLength={128} error={err} />
        <Button full loading={busy} onClick={change}>{t("c.save")}</Button>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">{t("sec.recovery")}</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{t("sec.recovery.b")}</p>
        <Button variant="soft" full onClick={() => setRkOpen(true)}><Icon name="lock" size={18} />{t("sec.recovery.new")}</Button>
      </Card>
      <Sheet open={rkOpen} onClose={() => { setRkOpen(false); setRk(null); }} title={t("sec.recovery")}>
        {rk ? (
          <RecoveryKey value={rk} title={t("rk.t")} body={t("rk.b")} cta={t("rk.saved")} onDone={() => { setRkOpen(false); setRk(null); }} />
        ) : (
          <div className="space-y-4">
            <Field label={t("f.current")} type="password" value={rkPw} onChange={(e) => { setRkPw(e.target.value); setRkErr(null); }} autoComplete="current-password" error={rkErr} maxLength={128} />
            <Button full loading={rkBusy} onClick={newKey}>{t("sec.recovery.new")}</Button>
          </div>
        )}
      </Sheet>
    </>
  );
}

function PrivacySection() {
  const { t, toast, errText } = useApp();
  const { data, reload } = useMe();
  if (!data) return <Skeleton className="h-48" />;
  const u = data.user;
  async function patch(body: Record<string, boolean>) {
    try {
      await api("/api/me", { method: "PATCH", body });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  return (
    <>
      <Card className="space-y-5">
        <div className="flex items-center justify-between gap-4"><div><p className="font-bold">{t("p.master")}</p><p className="text-sm text-muted">{t("p.master.d")}</p></div><Toggle checked={u.protectionEnabled} onChange={(v) => patch({ protectionEnabled: v })} label={t("p.master")} /></div>
        <div className="flex items-center justify-between gap-4"><div><p className="font-bold">{t("p.monitor")}</p><p className="text-sm text-muted">{t("p.monitor.d")}</p></div><Toggle checked={u.monitoringEnabled} onChange={(v) => patch({ monitoringEnabled: v })} label={t("p.monitor")} /></div>
      </Card>
      <Card className="!p-2">
        <a href="/vault" className="flex items-center gap-3 rounded-3xl p-3.5 font-semibold hover:bg-surface-2"><Icon name="vault" size={20} className="text-primary" /><span className="flex-1">{t("priv.consent")}</span><Icon name="chevron" size={18} className="text-muted" /></a>
        <a href="/protection" className="flex items-center gap-3 rounded-3xl p-3.5 font-semibold hover:bg-surface-2"><Icon name="shield" size={20} className="text-primary" /><span className="flex-1">{t("p.title")}</span><Icon name="chevron" size={18} className="text-muted" /></a>
      </Card>
    </>
  );
}

function NotificationsSection() {
  const { t, toast, errText } = useApp();
  const { data, reload } = useMe();
  if (!data) return <Skeleton className="h-64" />;
  const prefs = data.user.notifPrefs;
  async function set(k: keyof typeof prefs, v: boolean) {
    try {
      await api("/api/me", { method: "PATCH", body: { notifPrefs: { ...prefs, [k]: v } } });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  return (
    <Card className="space-y-5">
      {(["alerts", "activity", "rewards", "security"] as const).map((k) => (
        <div key={k} className="flex items-center justify-between gap-4"><p className="font-bold">{t(`n.${k}`)}</p><Toggle checked={prefs[k]} onChange={(v) => set(k, v)} label={t(`n.${k}`)} /></div>
      ))}
    </Card>
  );
}

function PaymentsSection() {
  const { data, reload } = useApi<{ methods: Method[]; payoutsAvailable: boolean }>("/api/wallet");
  if (!data) return <Skeleton className="h-48" />;
  return <Card><PaymentMethods methods={data.methods} payoutsAvailable={data.payoutsAvailable} onChange={reload} /></Card>;
}

function uaLabel(ua: string) {
  const b = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return o ? `${b} · ${o}` : b;
}

function DevicesSection() {
  const { t, locale, toast, errText } = useApp();
  const { data, reload } = useApi<{ sessions: { id: string; current: boolean; userAgent: string; lastSeenAt: string }[] }>("/api/sessions");
  if (!data) return <Skeleton className="h-48" />;
  async function out(id?: string) {
    try {
      await api(id ? `/api/sessions/${id}` : "/api/sessions", { method: "DELETE" });
      await reload();
    } catch (e) {
      toast(errText(e), "err");
    }
  }
  const others = data.sessions.filter((s) => !s.current);
  return (
    <>
      <Card>
        <ul className="divide-y divide-line">
          {data.sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3.5 py-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary"><Icon name="device" size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{uaLabel(s.userAgent)}{s.current && <span className="ml-2 text-xs font-semibold text-good">{t("d.this")}</span>}</p>
                <p className="text-xs text-muted">{t("d.last")}: {rel(s.lastSeenAt, locale)}</p>
              </div>
              {!s.current && <Button variant="soft" className="!px-4 !py-2 text-sm" onClick={() => out(s.id)}>{t("d.out")}</Button>}
            </li>
          ))}
        </ul>
        {others.length === 0 && <p className="pt-2 text-center text-sm text-muted">{t("d.none")}</p>}
      </Card>
      {others.length > 0 && <Button variant="danger" full onClick={() => out()}>{t("d.out_all")}</Button>}
    </>
  );
}

function HelpSection() {
  const { t } = useApp();
  return (
    <Card className="!p-3">
      {[1, 2, 3].map((n) => (
        <details key={n} className="group border-b border-line p-3 last:border-0">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold">
            {t(`help.q${n}`)}
            <Icon name="chevron" size={18} className="shrink-0 text-muted transition-transform group-open:rotate-90" />
          </summary>
          <p className="mt-3 text-muted">{t(`help.a${n}`)}</p>
        </details>
      ))}
    </Card>
  );
}

function SupportSection() {
  const { t, toast, errText } = useApp();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (subject.trim().length < 3 || message.trim().length < 10) return setErr(t("err.invalid_input"));
    setBusy(true);
    try {
      await api("/api/support", { body: { subject: subject.trim(), message: message.trim() } });
      setSubject(""); setMessage(""); setErr(null);
      toast(t("sup.sent"));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4">
      <p className="text-muted">{t("sup.b")}</p>
      <Field label={t("sup.subject")} value={subject} onChange={(e) => { setSubject(e.target.value); setErr(null); }} maxLength={120} />
      <TextArea label={t("sup.message")} value={message} onChange={(e) => { setMessage(e.target.value); setErr(null); }} maxLength={2000} error={err} />
      <Button full loading={busy} onClick={send}>{t("sup.send")}</Button>
    </Card>
  );
}

function ExportSection() {
  const { t, toast } = useApp();
  return (
    <Card>
      <Empty icon="download" title={t("s.export")} body={t("ex.b")} action={
        <a href="/api/me/export" download onClick={() => toast(t("ex.done"))} className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold"><Icon name="download" size={18} />{t("ex.btn")}</a>
      } />
    </Card>
  );
}

function DeleteSection() {
  const { t, errText } = useApp();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api("/api/me/delete", { body: { password: pw } });
      window.location.assign("/");
    } catch (e) {
      setOpen(false);
      setErr(errText(e));
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4">
      <p className="text-muted">{t("del.b")}</p>
      <Field label={t("del.pw")} type="password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(null); }} autoComplete="current-password" maxLength={128} error={err} />
      <Button variant="danger" full disabled={!pw} onClick={() => setOpen(true)}><Icon name="trash" size={18} />{t("del.btn")}</Button>
      <Confirm open={open} danger loading={busy} title={t("s.delete")} body={t("del.b")} confirmLabel={t("c.delete")} onConfirm={del} onClose={() => setOpen(false)} />
    </Card>
  );
}

export const SECTIONS: Record<string, ComponentType> = {
  profile: ProfileSection,
  account: AccountSection,
  language: LanguageSection,
  theme: ThemeSection,
  security: SecuritySection,
  privacy: PrivacySection,
  notifications: NotificationsSection,
  payments: PaymentsSection,
  devices: DevicesSection,
  help: HelpSection,
  support: SupportSection,
  export: ExportSection,
  delete: DeleteSection,
};
export const SECTION_IDS = [...Object.keys(SECTIONS), "policy", "terms"];
