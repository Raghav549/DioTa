"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Wordmark } from "@/components/Wordmark";
import { Icon } from "@/components/Icon";
import { useT } from "@/components/Providers";
import { Button, Sheet } from "@/components/ui";
import { LanguagePicker } from "@/components/LanguagePicker";
import { haptic } from "@/lib/client";

const SLIDES = [
  { img: "/intro/1.jpg", glow: "#a24ff0" },
  { img: "/intro/2.jpg", glow: "#f59e0b" },
  { img: "/intro/3.jpg", glow: "#3ddc97" },
  { img: "/intro/4.jpg", glow: "#d946ef" },
];

export default function Welcome() {
  const t = useT();
  const router = useRouter();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [langOpen, setLangOpen] = useState(false);
  const last = i === SLIDES.length - 1;

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 120, damping: 18 });
  const sy = useSpring(py, { stiffness: 120, damping: 18 });
  const rotY = useTransform(sx, [-1, 1], [-8, 8]);
  const rotX = useTransform(sy, [-1, 1], [6, -6]);
  const imgX = useTransform(sx, [-1, 1], [-14, 14]);
  const dragX = useMotionValue(0);
  const dragParallax = useTransform(dragX, (v) => v * 0.35);

  const go = (n: number) => {
    if (n < 0 || n >= SLIDES.length) return;
    haptic(10);
    setDir(n > i ? 1 : -1);
    setI(n);
  };
  const finish = () => {
    localStorage.setItem("dt_intro", "1");
    router.push("/language");
  };
  const s = SLIDES[i];

  return (
    <main
      className="relative flex min-h-dvh flex-col overflow-hidden px-5 pb-8 pt-5"
      onPointerMove={(e) => {
        px.set((e.clientX / window.innerWidth) * 2 - 1);
        py.set((e.clientY / window.innerHeight) * 2 - 1);
      }}
    >
      <motion.div aria-hidden className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-30 blur-[100px]" animate={{ background: s.glow }} transition={{ duration: 0.8 }} />

      <header className="relative z-10 mx-auto flex w-full max-w-md items-center justify-between">
        <Wordmark className="text-3xl" />
        <div className="flex items-center gap-2">
          <button onClick={() => setLangOpen(true)} aria-label={t("lang.t")} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface">
            <Icon name="globe" size={18} />
          </button>
          {!last && (
            <button onClick={finish} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">
              {t("c.skip")}
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 70, opacity: 0, scale: 0.96 }),
              center: { x: 0, opacity: 1, scale: 1 },
              exit: (d: number) => ({ x: d * -70, opacity: 0, scale: 0.96 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            style={{ x: dragX }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -70) go(i + 1);
              else if (info.offset.x > 70) go(i - 1);
            }}
            className="touch-pan-y"
          >
            <div style={{ perspective: 1000 }}>
              <motion.div style={{ rotateX: rotX, rotateY: rotY, x: dragParallax }} className="glass overflow-hidden rounded-[36px] p-2">
                <motion.div style={{ x: imgX, scale: 1.12 }} className="overflow-hidden rounded-[30px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt="" draggable={false} className="aspect-[3/2] w-full object-cover" />
                </motion.div>
              </motion.div>
            </div>
            <div className="mt-8 text-center">
              <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">{t(`intro.${i + 1}.t`)}</h1>
              <p className="mx-auto mt-3 max-w-sm text-[17px] leading-relaxed text-muted">{t(`intro.${i + 1}.b`)}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="relative z-10 mx-auto w-full max-w-md">
        <div className="mb-6 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((_, n) => (
            <motion.span key={n} animate={{ width: n === i ? 28 : 8, opacity: n === i ? 1 : 0.35 }} className="h-2 rounded-full btn-primary" />
          ))}
        </div>
        <div className="flex gap-3">
          {i > 0 && (
            <Button variant="soft" onClick={() => go(i - 1)} aria-label={t("c.back")}>
              <Icon name="back" size={18} />
            </Button>
          )}
          <Button full onClick={() => (last ? finish() : go(i + 1))}>
            {last ? t("c.start") : t("c.next")}
          </Button>
        </div>
      </footer>

      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title={t("lang.t")}>
        <LanguagePicker persist={false} />
      </Sheet>
    </main>
  );
}
