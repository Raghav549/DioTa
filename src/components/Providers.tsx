"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dictionaries, localeOf, translate } from "@/i18n";
import type { LangCode, Theme } from "@/lib/catalog";
import { api, ApiErr, setCookie } from "@/lib/client";

type Params = Record<string, string | number>;
type Ctx = {
  lang: LangCode;
  locale: string;
  t: (key: string, params?: Params) => string;
  setLang: (l: LangCode, persist?: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme, persist?: boolean) => void;
  toast: (msg: string, kind?: "ok" | "err") => void;
  errText: (e: unknown) => string;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("Providers missing");
  return c;
};
export const useT = () => useApp().t;

export function Providers({ lang: l0, theme: t0, children }: { lang: LangCode; theme: Theme; children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(l0);
  const [theme, setThemeState] = useState<Theme>(t0);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);

  const t = useCallback((k: string, p?: Params) => translate(lang, k, p), [lang]);

  const setLang = useCallback((l: LangCode, persist = true) => {
    setLangState(l);
    setCookie("dt_lang", l);
    document.documentElement.lang = l;
    if (persist) api("/api/me", { method: "PATCH", body: { language: l }, noRedirect: true }).catch(() => {});
  }, []);

  const setTheme = useCallback((th: Theme, persist = true) => {
    setThemeState(th);
    setCookie("dt_theme", th);
    document.documentElement.dataset.theme = th;
    if (persist) api("/api/me", { method: "PATCH", body: { theme: th }, noRedirect: true }).catch(() => {});
  }, []);

  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 3600);
  }, []);

  const errText = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiErr ? e.code : "generic";
      const key = `err.${code}`;
      return key in dictionaries.en ? t(key) : t("err.generic");
    },
    [t],
  );

  const value = useMemo(
    () => ({ lang, locale: localeOf(lang), t, setLang, theme, setTheme, toast, errText }),
    [lang, t, setLang, theme, setTheme, toast, errText],
  );

  return (
    <AppCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className={`glass-solid pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium ${
                x.kind === "err" ? "text-bad" : "text-good"
              }`}
            >
              {x.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AppCtx.Provider>
  );
}
