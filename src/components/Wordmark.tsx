"use client";
import { motion } from "framer-motion";

const LETTERS = [
  { c: "D", cls: "dt-up" },
  { c: "i", cls: "dt-it" },
  { c: "o", cls: "dt-it" },
  { c: "T", cls: "dt-up" },
  { c: "a", cls: "dt-it" },
];

/** The brand is the word itself: typographic, colourful, softly animated. Not a logo. */
export function Wordmark({ className = "text-3xl", reveal = false }: { className?: string; reveal?: boolean }) {
  return (
    <span className={`dt-word ${className}`} role="img" aria-label="DioTa">
      {LETTERS.map((l, i) => {
        const style = { animationDelay: `${-i * 1.1}s` };
        return reveal ? (
          <motion.span
            key={i}
            aria-hidden
            className={`dt-letter ${l.cls}`}
            style={style}
            initial={{ opacity: 0, y: 36, filter: "blur(14px)", scale: 0.9 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            {l.c}
          </motion.span>
        ) : (
          <span key={i} aria-hidden className={`dt-letter ${l.cls}`} style={style}>
            {l.c}
          </span>
        );
      })}
    </span>
  );
}
