"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Button, Field } from "@/components/ui";
import { api } from "@/lib/client";
import { isLang, THEMES, type Theme } from "@/lib/catalog";

export function LoginForm({ google, googleError }: { google: boolean; googleError: "err.generic" | "err.email_taken" | null }) {
  const { t, errText, setLang, setTheme } = useApp();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(googleError ? t(googleError) : null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (id.trim().length < 3 || !pw) return setErr(t("v.required"));
    setLoading(true);
    setErr(null);
    try {
      const r = await api<{ language: string; theme: string }>("/api/auth/login", { body: { identifier: id.trim(), password: pw } });
      if (isLang(r.language)) setLang(r.language, false);
      if (THEMES.includes(r.theme as Theme)) setTheme(r.theme as Theme, false);
      window.location.assign("/home");
    } catch (ex) {
      setErr(errText(ex));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t("li.t")}</h1>
      <p className="mb-8 mt-2 text-muted">{t("li.b")}</p>
      <div className="space-y-4">
        <Field label={t("f.identifier")} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="none" inputMode="email" enterKeyHint="next" maxLength={254} autoFocus />
        <Field label={t("f.password")} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" enterKeyHint="go" maxLength={128} error={err} />
      </div>
      <div className="mt-3 text-right">
        <a href="/forgot" className="text-sm font-semibold text-primary">{t("li.forgot")}</a>
      </div>
      <Button type="submit" full loading={loading} className="mt-6">{t("li.btn")}</Button>
      {google && (
        <>
          <div className="my-5 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-line" />{t("c.or")}<span className="h-px flex-1 bg-line" />
          </div>
          <a href="/api/auth/google" className="flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-6 py-3.5 font-semibold">
            <Icon name="globe" size={18} /> {t("li.google")}
          </a>
        </>
      )}
      <p className="mt-7 text-center text-sm text-muted">
        {t("li.new")}{" "}
        <a href="/language" className="font-semibold text-primary">{t("li.create")}</a>
      </p>
    </form>
  );
}
