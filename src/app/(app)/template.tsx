import type { ReactNode } from "react";

/** Page entrance: a short CSS-only fade/rise (no JavaScript), so screens open instantly. */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="rise">{children}</div>;
}
