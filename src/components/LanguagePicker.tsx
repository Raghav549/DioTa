"use client";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { LANGS } from "@/lib/catalog";
import { haptic } from "@/lib/client";

const ENGLISH: Record<string, string> = { en: "English", hi: "Hindi", bn: "Bengali", gu: "Gujarati", ne: "Nepali", ta: "Tamil", te: "Telugu" };

export function LanguagePicker({ persist = true }: { persist?: boolean }) {
  const { lang, setLang } = useApp();
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
      {LANGS.map((l, i) => {
        const on = l.code === lang;
        return (
          <motion.button
            key={l.code}
            role="radio"
            aria-checked={on}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              haptic(10);
              setLang(l.code, persist);
            }}
            className={`flex items-center justify-between rounded-3xl border p-4 text-left transition-colors ${
              on ? "border-primary bg-primary/12" : "border-line bg-surface"
            }`}
          >
            <span>
              <span className="block text-lg font-bold">{l.native}</span>
              <span className="block text-xs text-muted">{ENGLISH[l.code]}</span>
            </span>
            <span className={`grid h-7 w-7 place-items-center rounded-full ${on ? "btn-primary" : "border border-line"}`}>{on && <Icon name="check" size={16} stroke={2.6} />}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
