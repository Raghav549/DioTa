"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { AppLogo } from "@/components/ui";
import { useCaught, type Caught } from "@/lib/live";
import { useIsNative } from "@/lib/native";

export type { Caught };

/** One playback: ["ohh"] → app (logo + one line) → "Don't worry…" → "DioTa blocked it! Enjoy" 🎉 */
type Scene = "ohh" | "app" | "worry" | "blocked";
const DURATION: Record<Scene, number> = { ohh: 1100, app: 2600, worry: 1500, blocked: 2800 };
/** The same app hitting the same tracker again within this window is the same story, not a new one. */
const SAME_STORY_MS = 20_000;
const EASE = [0.22, 1, 0.36, 1] as const;

const keyOf = (c: Caught) => `${c.pkg || c.appSlug}|${c.domain}`;
const msOf = (c: Caught) => Date.parse(c.at) || 0;

/**
 * Home card headline: the "Activities" movie. Every real attempt DioTa's tracker shield blocks plays
 * as a short motion-graphics scene with the app's own logo. Nothing is invented: it only plays
 * events from the phone (pushed live) and the account's list.
 */
export const InterceptStream = memo(function InterceptStream() {
  const { t } = useApp();
  const native = useIsNative();
  const reduce = !!useReducedMotion();
  const items = useCaught();
  const [story, setStory] = useState<{ e: Caught; scene: Scene; n: number } | null>(null);
  const played = useRef<{ key: string; at: number } | null>(null);
  const latest = items?.[0];

  // Start the next story when the current one has finished (or right away if nothing is playing).
  const idle = !story || story.scene === "blocked";
  const [blockedDone, setBlockedDone] = useState(true);
  useEffect(() => {
    if (!latest || !idle || !blockedDone) return;
    const p = played.current;
    const at = msOf(latest);
    const isNew = !p || (keyOf(latest) !== p.key ? at > p.at : at > p.at + SAME_STORY_MS);
    if (!isNew) return;
    played.current = { key: keyOf(latest), at };
    setBlockedDone(false);
    setStory((s) => ({ e: latest, scene: s ? "ohh" : "app", n: (s?.n ?? 0) + 1 }));
  }, [latest, idle, blockedDone]);

  // Advance through the scenes.
  useEffect(() => {
    if (!story) return;
    const id = setTimeout(() => {
      if (story.scene === "blocked") setBlockedDone(true);
      else setStory({ ...story, scene: story.scene === "ohh" ? "app" : story.scene === "app" ? "worry" : "blocked" });
    }, DURATION[story.scene]);
    return () => clearTimeout(id);
  }, [story]);

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-2">
        <p className="absolute left-4 top-3 z-10 text-xs font-bold uppercase tracking-[0.14em] text-muted">{t("mv.title")}</p>
        <div className="relative grid h-[11.5rem] place-items-center px-4 pb-3 pt-8 text-center" aria-live="polite" aria-atomic="true">
          {items === null ? null : !story ? (
            <div>
              <p className="font-display text-lg font-semibold leading-snug">{t("h.stream.empty")}</p>
              <p className="mt-1 text-sm text-muted">{native ? t("mv.empty.native") : t("mv.empty.web")}</p>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <SceneView key={`${story.n}-${story.scene}`} scene={story.scene} e={story.e} reduce={reduce} />
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
});

function SceneView({ scene, e, reduce }: { scene: Scene; e: Caught; reduce: boolean }) {
  const { t } = useApp();
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };

  if (scene === "app") {
    const line = e.kind === "app" || !e.data.length ? t("mv.online") : t("mv.tried", { data: t(`dk.${e.data[0]}`) });
    return (
      <motion.div className="flex flex-col items-center" exit={reduce ? { opacity: 0 } : { opacity: 0, y: -26, scale: 0.9 }} transition={{ duration: 0.3, ease: EASE }}>
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 70, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 260, damping: 20 }}
          className="rounded-[28%] shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)]"
        >
          <AppLogo slug={e.appSlug} name={e.app} size={64} />
        </motion.div>
        <motion.p
          className="mt-3 max-w-[16rem] truncate text-sm font-semibold text-muted"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.28, duration: 0.35, ease: EASE }}
        >
          {e.app}
        </motion.p>
        <motion.p
          className="font-display mt-0.5 max-w-[17rem] text-lg font-semibold leading-snug [overflow-wrap:anywhere]"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 0.42, duration: 0.35, ease: EASE }}
        >
          {line}
        </motion.p>
      </motion.div>
    );
  }

  if (scene === "ohh" || scene === "worry")
    return (
      <motion.p
        className="font-display text-[clamp(1.5rem,7vw,2rem)] font-semibold tracking-tight"
        {...(reduce
          ? fade
          : {
              initial: { opacity: 0, scale: 0.7, filter: "blur(6px)" },
              animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
              exit: { opacity: 0, scale: 1.15, filter: "blur(6px)" },
              transition: { duration: 0.35, ease: EASE },
            })}
      >
        {scene === "ohh" ? t("mv.ohh") : t("mv.worry")}
      </motion.p>
    );

  return (
    <motion.div className="relative flex flex-col items-center" {...fade}>
      {!reduce && <Burst />}
      <motion.span
        aria-hidden
        className="block"
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.2, rotate: -30 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 420, damping: 14 }}
      >
        <Popper />
      </motion.span>
      <motion.p
        className="font-display mt-2 text-[clamp(1.35rem,6.2vw,1.8rem)] font-semibold leading-tight tracking-tight"
        style={{ color: "var(--good)" }}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: reduce ? 0 : 0.12, duration: 0.4, ease: EASE }}
      >
        {t("mv.blocked")}
      </motion.p>
    </motion.div>
  );
}

/** Party popper, drawn (emoji fonts differ between phones). */
function Popper() {
  return (
    <svg width="46" height="46" viewBox="0 0 48 48" aria-hidden>
      <path d="M6 43 17 15l16 16Z" fill="#F5B700" />
      <path d="M11.2 30 20.6 39.4M14.2 22.4 26 34.2" stroke="#FF5C8A" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 15 33 31" stroke="#E09A00" strokeWidth="2" strokeLinecap="round" />
      <path d="M26 13c2-4 1-7-1-9M35 22c4-2 7-1 9 1" stroke="#7B61FF" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M31 17c3-3 6-3 8-6" stroke="#00B3A4" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <circle cx="37" cy="7" r="2.4" fill="#FF8A00" />
      <circle cx="43" cy="15" r="2" fill="#FF5C8A" />
      <circle cx="22" cy="6" r="1.8" fill="#2BB673" />
      <circle cx="42" cy="30" r="1.8" fill="#7B61FF" />
    </svg>
  );
}

const COLORS = ["#F5B700", "#FF5C8A", "#00B3A4", "#7B61FF", "#FF8A00", "#2BB673"];

/** Party-popper burst: confetti flying out of the centre (deterministic, so renders stay pure). */
function Burst() {
  const bits = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const r = (n: number) => ((Math.sin((i + 1) * 12.9898 * n) * 43758.5453) % 1 + 1) % 1;
        const angle = (i / 22) * Math.PI * 2 + r(1) * 0.5;
        const dist = 70 + r(2) * 70;
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.7 - 10, rot: r(3) * 540 - 270, w: 5 + r(4) * 5, round: i % 3 === 0, color: COLORS[i % COLORS.length], delay: r(5) * 0.08 };
      }),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute block"
          style={{ width: b.w, height: b.round ? b.w : b.w * 1.8, background: b.color, borderRadius: b.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: [0, b.y, b.y + 40], opacity: [1, 1, 0], rotate: b.rot, scale: 1 }}
          transition={{ duration: 1.5, delay: b.delay, ease: "easeOut", times: [0, 0.55, 1] }}
        />
      ))}
    </div>
  );
}
