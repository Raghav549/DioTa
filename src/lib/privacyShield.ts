import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null | undefined;

/**
 * Source of the anti-fingerprinting shield (public/privacy-shield.js), inlined first in <head> so
 * it runs before any other script on the page. Read once per server instance; if the file is ever
 * missing the page still renders (without the shield) rather than failing.
 */
export function privacyShieldSource(): string | null {
  if (cached !== undefined) return cached;
  try {
    const src = readFileSync(path.join(process.cwd(), "public", "privacy-shield.js"), "utf8");
    // Never let the inlined source close the <script> element early.
    cached = src.replace(/<\/script/gi, "<\\/script");
  } catch {
    cached = null;
  }
  return cached;
}
