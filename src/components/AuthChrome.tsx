"use client";
import { useState, type ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";
import { Icon } from "@/components/Icon";
import { useApp } from "@/components/Providers";
import { Sheet } from "@/components/ui";
import { LanguagePicker } from "@/components/LanguagePicker";

export function AuthChrome({ children }: { children: ReactNode }) {
  const { t, theme, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-5">
      <header className="flex items-center justify-between">
        <Wordmark className="text-4xl" />
        <div className="flex gap-2">
          <button onClick={() => setTheme(next, false)} aria-label={t("s.theme")} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface">
            <Icon name={theme === "dark" ? "moon" : "sun"} size={18} />
          </button>
          <button onClick={() => setOpen(true)} aria-label={t("s.language")} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface">
            <Icon name="globe" size={18} />
          </button>
        </div>
      </header>
      <div className="rise flex flex-1 flex-col justify-center py-8" style={{ ["--rise" as string]: "18px", animationDuration: "0.5s" }}>
        {children}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title={t("lang.t")}>
        <LanguagePicker persist={false} />
      </Sheet>
    </main>
  );
}
