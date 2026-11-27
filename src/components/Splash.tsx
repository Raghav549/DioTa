"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Wordmark } from "@/components/Wordmark";

export function Splash() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const target = typeof localStorage !== "undefined" && localStorage.getItem("dt_intro") ? "/login" : "/welcome";
    router.prefetch(target);
    const a = setTimeout(() => setLeaving(true), 2600);
    const b = setTimeout(() => router.replace(target), 3200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [router]);

  return (
    <motion.main
      className="relative grid min-h-dvh place-items-center overflow-hidden"
      animate={leaving ? { opacity: 0, scale: 1.08, filter: "blur(12px)" } : { opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
    >
      {[
        { c: "var(--primary)", x: ["-20%", "15%", "-20%"], y: ["-15%", "10%", "-15%"], s: 420 },
        { c: "var(--primary-2)", x: ["20%", "-15%", "20%"], y: ["15%", "-10%", "15%"], s: 360 },
        { c: "var(--good)", x: ["0%", "25%", "0%"], y: ["25%", "-5%", "25%"], s: 260 },
      ].map((o, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute rounded-full opacity-30 blur-[90px]"
          style={{ background: o.c, width: o.s, height: o.s }}
          animate={{ x: o.x, y: o.y }}
          transition={{ duration: 7 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div className="relative flex flex-col items-center">
        <Wordmark reveal className="text-[26vw] sm:text-[8.5rem]" />
        <motion.div
          aria-hidden
          className="mt-6 h-px w-40 origin-left"
          style={{ background: "linear-gradient(90deg, transparent, var(--primary), var(--primary-2), transparent)" }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ delay: 1.1, duration: 1, ease: "easeOut" }}
        />
      </div>
    </motion.main>
  );
}
