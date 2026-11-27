"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { RecoveryKey } from "@/components/RecoveryKey";
import { Button, Field } from "@/components/ui";
import { api } from "@/lib/client";
import { EMAIL_RE, PHONE_RE, cleanPhone, passwordOk, passwordRules } from "@/lib/rules";

const KEYS = ["name", "email", "phone", "pw", "cf", "consent"] as const;

export default function Signup() {
  const { t, errText } = useApp();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [v, setV] = useState({ name: "", email: "", phone: "", pw: "", cf: "", terms: false, privacy: false });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);

  const set = (k: keyof typeof v, val: string | boolean) => {
    setV((x) => ({ ...x, [k]: val }));
    setErr(null);
  };
  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
    setErr(null);
  };

  function validate(): string | null {
    switch (KEYS[step]) {
      case "name":
        return v.name.trim().length < 2 ? t("v.name") : null;
      case "email":
        return !EMAIL_RE.test(v.email.trim()) ? t("v.email") : null;
      case "phone":
        return v.phone.trim() && !PHONE_RE.test(cleanPhone(v.phone)) ? t("v.phone") : null;
      case "pw":
        return !passwordOk(v.pw) ? t("v.pw") : null;
      case "cf":
        return v.cf !== v.pw ? t("v.match") : null;
      case "consent":
        return !v.terms || !v.privacy ? t("v.consent") : null;
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = validate();
    if (bad) return setErr(bad);
    if (step < KEYS.length - 1) return go(step + 1);
    setLoading(true);
    try {
      const r = await api<{ recoveryKey: string }>("/api/auth/signup", {
        body: { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim() ? cleanPhone(v.phone) : undefined, password: v.pw, consentTerms: true, consentPrivacy: true },
      });
      setRecovery(r.recoveryKey);
    } catch (ex) {
      const code = (ex as { code?: string }).code;
      if (code === "email_taken") go(1);
      if (code === "phone_taken") go(2);
      setErr(errText(ex));
    } finally {
      setLoading(false);
    }
  }

  if (recovery)
    return <RecoveryKey value={recovery} title={t("rk.t")} body={t("rk.b")} cta={t("rk.saved")} onDone={() => window.location.assign("/home")} />;

  const key = KEYS[step];
  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-8 flex items-center gap-3">
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} aria-label={t("c.back")} className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface disabled:opacity-30">
          <Icon name="back" size={20} />
        </button>
        <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={KEYS.length} aria-valuenow={step + 1}>
          {KEYS.map((_, n) => (
            <div key={n} className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
              <motion.div className="h-full rounded-full btn-primary" initial={false} animate={{ width: n <= step ? "100%" : "0%" }} transition={{ duration: 0.5, ease: "easeOut" }} />
            </div>
          ))}
        </div>
      </div>
      <p className="mb-2 text-sm font-semibold text-primary">{t("c.step", { n: step + 1, total: KEYS.length })}</p>

      <div className="relative min-h-[18rem]">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={key}
            custom={dir}
            variants={{ in: (d: number) => ({ x: d * 40, opacity: 0 }), mid: { x: 0, opacity: 1 }, out: (d: number) => ({ x: d * -40, opacity: 0 }) }}
            initial="in"
            animate="mid"
            exit="out"
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">{t(`su.${key}.t`)}</h1>
            <p className="mb-6 mt-2 text-muted">{t(`su.${key}.b`)}</p>

            {key === "name" && <Field label={t("f.name")} value={v.name} onChange={(e) => set("name", e.target.value)} error={err} autoFocus autoComplete="name" enterKeyHint="next" maxLength={80} />}
            {key === "email" && <Field label={t("f.email")} type="email" inputMode="email" value={v.email} onChange={(e) => set("email", e.target.value)} error={err} autoFocus autoComplete="email" autoCapitalize="none" enterKeyHint="next" maxLength={254} />}
            {key === "phone" && <Field label={`${t("f.phone")} (${t("c.optional")})`} type="tel" inputMode="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} error={err} autoFocus autoComplete="tel" enterKeyHint="next" maxLength={20} />}
            {key === "pw" && (
              <>
                <Field label={t("f.password")} type="password" value={v.pw} onChange={(e) => set("pw", e.target.value)} error={err} autoFocus autoComplete="new-password" enterKeyHint="next" maxLength={128} />
                <Rules pw={v.pw} />
              </>
            )}
            {key === "cf" && (
              <>
                <Field label={t("f.confirm")} type="password" value={v.cf} onChange={(e) => set("cf", e.target.value)} error={err} autoFocus autoComplete="new-password" enterKeyHint="next" maxLength={128} />
                <Rules pw={v.pw} extra={{ label: t("pw.match"), ok: v.cf.length > 0 && v.cf === v.pw }} />
              </>
            )}
            {key === "consent" && (
              <div className="space-y-3">
                {(["terms", "privacy"] as const).map((k) => (
                  <button key={k} type="button" role="checkbox" aria-checked={v[k]} onClick={() => set(k, !v[k])} className={`flex w-full items-start gap-3 rounded-3xl border p-4 text-left transition-colors ${v[k] ? "border-primary bg-primary/10" : "border-line bg-surface"}`}>
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${v[k] ? "btn-primary" : "border border-line"}`}>{v[k] && <Icon name="check" size={15} stroke={3} />}</span>
                    <span className="text-[15px] leading-snug">{t(`su.consent.${k}`)}</span>
                  </button>
                ))}
                <p className="flex gap-4 px-1 text-sm font-semibold text-primary">
                  <a href="/legal/terms" target="_blank" rel="noopener">{t("s.terms")}</a>
                  <a href="/legal/privacy" target="_blank" rel="noopener">{t("s.policy")}</a>
                </p>
                {err && <p role="alert" className="text-sm font-medium text-bad">{err}</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <Button type="submit" full loading={loading} className="mt-4">
        {step === KEYS.length - 1 ? t("su.create") : t("c.continue")}
      </Button>
      <p className="mt-5 text-center text-sm text-muted">
        {t("su.have")}{" "}
        <Link href="/login" className="font-semibold text-primary">{t("li.btn")}</Link>
      </p>
    </form>
  );
}

function Rules({ pw, extra }: { pw: string; extra?: { label: string; ok: boolean } }) {
  const { t } = useApp();
  const items = [
    ...(Object.keys(passwordRules) as (keyof typeof passwordRules)[]).map((k) => ({ label: t(`pw.${k}`), ok: passwordRules[k](pw) })),
    ...(extra ? [extra] : []),
  ];
  return (
    <ul className="mt-4 space-y-2">
      {items.map((r) => (
        <li key={r.label} className={`flex items-center gap-2.5 text-sm transition-colors ${r.ok ? "text-good" : "text-muted"}`}>
          <span className={`grid h-5 w-5 place-items-center rounded-full ${r.ok ? "bg-good/20" : "bg-track"}`}>{r.ok && <Icon name="check" size={12} stroke={3} />}</span>
          {r.label}
        </li>
      ))}
    </ul>
  );
}
