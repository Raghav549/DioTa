"use client";
import { useId, useMemo, useState } from "react";
import { motion } from "framer-motion";

export type Point = { label: string; value: number };

function smooth(pts: [number, number][]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

/** Smooth, interactive area chart. Values come straight from the data passed in. */
export function Chart({ data, format, height = 170, color = "var(--good)" }: { data: Point[]; format: (v: number) => string; height?: number; color?: string }) {
  const gid = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const pts = useMemo<[number, number][]>(
    () => data.map((d, i) => [n === 1 ? 50 : (i / (n - 1)) * 100, 34 - (d.value / max) * 28]),
    [data, max, n],
  );
  const line = smooth(pts);
  const area = `${line} L 100 40 L 0 40 Z`;
  const idx = active ?? n - 1;
  const cur = pts[idx];
  const labelStep = Math.ceil(n / 6);

  return (
    <div>
      <div
        className="relative touch-pan-y"
        style={{ height }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        onPointerLeave={() => setActive(null)}
      >
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.8 }} />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.3, ease: "easeInOut" }}
          />
        </svg>
        {cur && (
          <>
            <div className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${cur[0]}%` }} />
            <motion.div
              className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
              style={{ background: color }}
              animate={{ left: `${cur[0]}%`, top: `${(cur[1] / 40) * 100}%` }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            />
            <motion.div
              className="glass-solid absolute -translate-x-1/2 whitespace-nowrap rounded-2xl px-3 py-1.5 text-center text-xs font-bold"
              animate={{ left: `${Math.min(88, Math.max(12, cur[0]))}%`, top: `${Math.max(0, (cur[1] / 40) * 100 - 26)}%` }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
            >
              {format(data[idx].value)}
            </motion.div>
          </>
        )}
      </div>
      <div className="mt-3 flex justify-between text-xs text-muted">
        {data.map((d, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <span key={i} className={i === idx ? "font-bold text-fg" : ""}>
              {d.label}
            </span>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}
