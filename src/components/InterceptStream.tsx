"use client";
import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { dataList } from "@/components/Activity";
import { useApp } from "@/components/Providers";
import { api, rel } from "@/lib/client";
import { Phone, useIsNative } from "@/lib/native";

export type Caught = {
  id: string;
  app: string;
  appSlug: string;
  domain: string;
  org: string;
  kind: string;
  data: string[];
  trigger: string;
  count: number;
  at: string;
};

const POLL_MS = 4000;
const SHOW_MS = 5200;

/**
 * Home card headline: a cinematic, real-time stream of attempts DioTa's tracker shield blocked on
 * the user's phone. Only real events from /api/intercepts; nothing is invented. New attempts jump
 * to the front the moment they arrive; otherwise the latest ones play in turn.
 */
export const InterceptStream = memo(function InterceptStream() {
  const { t, locale } = useApp();
  const native = useIsNative();
  const reduce = useReducedMotion();
  const [items, setItems] = useState<Caught[] | null>(null);
  const [idx, setIdx] = useState(0);
  /** Newest attempt shown so far (undefined until the first answer). */
  const topId = useRef<string | null | undefined>(undefined);

  // Poll while the screen is visible. State only changes when something new arrives.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await api<{ intercepts: Caught[] }>("/api/intercepts?limit=12");
          if (!alive) return;
          const first = r.intercepts[0]?.id ?? null;
          if (first !== topId.current) {
            const fresh = topId.current !== undefined;
            topId.current = first;
            setItems(r.intercepts);
            if (fresh) setIdx(0); // a new attempt was just blocked: show it now
          }
        } catch {
          if (alive && topId.current === undefined) {
            topId.current = null;
            setItems([]);
          }
        }
      }
      if (alive) timer = setTimeout(tick, POLL_MS);
    };
    tick();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      if (native) Phone.flushIntercepts().catch(() => {});
      tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [native]);

  // Play the latest attempts one after another.
  const count = items?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % Math.min(count, 8)), SHOW_MS);
    return () => clearInterval(id);
  }, [count]);

  if (items === null) return <div className="min-h-[7.5rem]" aria-hidden />;

  if (!items.length)
    return (
      <div className="min-h-[7.5rem]">
        <h1 className="font-display text-[clamp(1.6rem,7.4vw,2.2rem)] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">{t("h.stream.empty")}</h1>
        <p className="mt-3 max-w-sm text-muted">{native ? t("h.stream.empty.native") : t("h.stream.empty.web")}</p>
      </div>
    );

  const e = items[Math.min(idx, items.length - 1)];
  const line =
    e.kind === "app"
      ? t("h.stream.app", { app: e.app, trigger: t(`tg.${e.trigger}`) })
      : t("h.stream.line", { app: e.app, data: dataList(t, locale, e.data), trigger: t(`tg.${e.trigger}`) });
  const words = line.replace(/\s{2,}/g, " ").replace(/\s+…/, "…").split(" ");
  const step = reduce ? 0 : 0.045;

  return (
    <div className="relative min-h-[7.5rem]" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={e.id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-[clamp(1.3rem,5.8vw,1.75rem)] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
            {words.map((w, i) => (
              <motion.span
                key={i}
                className="inline-block whitespace-pre"
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * step, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                {w}
                {i < words.length - 1 ? " " : ""}
              </motion.span>
            ))}
          </h1>
          <motion.p
            className="font-display mt-2 text-[clamp(1.15rem,5vw,1.45rem)] font-semibold italic leading-snug"
            style={{ color: "var(--good)" }}
            initial={reduce ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + words.length * step, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {t("h.stream.blocked")}
          </motion.p>
          <p className="mt-2 truncate text-xs text-muted">
            {[e.org, e.domain].filter(Boolean).join(" · ")}
            {e.count > 1 ? ` · ×${e.count}` : ""} · {rel(e.at, locale)}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
