import { en, type Dict, type Key } from "./en";
import { hi } from "./hi";
import { bn } from "./bn";
import { gu } from "./gu";
import { ne } from "./ne";
import { ta } from "./ta";
import { te } from "./te";
import { LANGS, type LangCode } from "@/lib/catalog";

export type { Key, Dict };
export const dictionaries: Record<LangCode, Dict> = { en, hi, bn, gu, ne, ta, te };

export function translate(lang: LangCode, key: Key | string, params?: Record<string, string | number>): string {
  const d = dictionaries[lang] as Record<string, string>;
  let s = d[key] ?? (en as Record<string, string>)[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const localeOf = (lang: LangCode) => LANGS.find((l) => l.code === lang)?.locale ?? "en-IN";
