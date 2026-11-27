"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useApp } from "@/components/Providers";
import { RecoveryKey } from "@/components/RecoveryKey";
import { Button, Field } from "@/components/ui";
import { api } from "@/lib/client";
import { EMAIL_RE, passwordOk } from "@/lib/rules";

export default function Forgot() {
  const { t, errText } = useApp();
  const [email, setEmail] = useState("");
  const [key, setKey] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setErr(t("v.email"));
    if (key.trim().length < 10) return setErr(t("v.required"));
    if (!passwordOk(pw)) return setErr(t("v.pw"));
    setLoading(true);
    setErr(null);
    try {
      const r = await api<{ recoveryKey: string }>("/api/auth/recover", { body: { email: email.trim(), recoveryKey: key.trim(), password: pw } });
      setNewKey(r.recoveryKey);
    } catch (ex) {
      setErr(errText(ex));
    } finally {
      setLoading(false);
    }
  }

  if (newKey) return <RecoveryKey value={newKey} title={t("fg.done.t")} body={t("fg.done.b")} cta={t("fg.back")} onDone={() => window.location.assign("/login")} />;

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t("fg.t")}</h1>
      <p className="mb-8 mt-2 text-muted">{t("fg.b")}</p>
      <div className="space-y-4">
        <Field label={t("f.email")} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" maxLength={254} autoFocus />
        <Field label={t("f.recovery")} value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={60} />
        <Field label={t("f.newpw")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={128} error={err} hint={`${t("pw.len")} · ${t("pw.mix")} · ${t("pw.num")} · ${t("pw.sym")}`} />
      </div>
      <Button type="submit" full loading={loading} className="mt-6">{t("fg.btn")}</Button>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-primary">{t("fg.back")}</Link>
      </p>
    </form>
  );
}
