"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/Providers";
import { Button } from "@/components/ui";

export function RecoveryKey({ value, title, body, cta, onDone }: { value: string; title: string; body: string; cta: string; onDone: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon name="lock" size={26} />
      </div>
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-6 mt-2 text-muted">{body}</p>
      <div className="glass select-all p-5 text-center font-mono text-xl font-bold leading-relaxed tracking-wider" aria-label={t("f.recovery")}>
        {value}
      </div>
      <Button
        variant="soft"
        full
        className="mt-4"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            /* clipboard unavailable: key stays selectable */
          }
        }}
      >
        <Icon name={copied ? "check" : "copy"} size={18} />
        {copied ? t("c.copied") : t("c.copy")}
      </Button>
      <Button full className="mt-3" onClick={onDone}>
        {cta}
      </Button>
    </motion.div>
  );
}
