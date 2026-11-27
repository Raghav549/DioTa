import data from "@/lib/data/trackers.json";
import { catalogByPkg, type Category } from "@/lib/catalog";

/** What a blocked attempt was: a known tracker endpoint, or any traffic of an app the user blocked. */
export type Kind = keyof typeof data.kinds | "app";
export const KINDS = [...(Object.keys(data.kinds) as (keyof typeof data.kinds)[]), "app"] as const satisfies readonly Kind[];
export const TRIGGERS = ["launch", "foreground", "background", "screen_off", "unknown"] as const;
export type Trigger = (typeof TRIGGERS)[number];

/** The kinds of data a tracker of this kind is built to collect (from the trackers' own documentation). */
export const KIND_DATA: Record<Kind, readonly string[]> = { ...data.kinds, app: ["all"] };

const BY_DOMAIN = new Map<string, { org: string; kind: Kind }>(
  (data.trackers as [string, string, string][]).map(([d, org, kind]) => [d, { org, kind: kind as Kind }]),
);

export const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** The tracker a domain belongs to (exact or parent-domain match), or null. */
export function matchTracker(domain: string): { org: string; kind: Kind; suffix: string } | null {
  const d = domain.toLowerCase().replace(/\.$/, "");
  if (!DOMAIN_RE.test(d)) return null;
  const parts = d.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join(".");
    const hit = BY_DOMAIN.get(suffix);
    if (hit) return { ...hit, suffix };
  }
  return null;
}

const BROWSERS = new Set(["googlechrome", "firefox", "brave", "opera", "duckduckgo"]);
const FINANCE = new Set(["phonepe", "googlepay", "paytm", "paypal", "zerodha", "hdfcbank", "icicibank"]);
const SHOPPING = new Set(["ebay", "aliexpress", "bigbasket", "swiggy", "zomato", "bookmyshow", "airbnb"]);
const LOCATION = new Set(["googlemaps", "uber"]);

/** The kind of app, from the catalog or (for any other installed app) its package name. */
export function appCategory(pkg: string): Category | null {
  const slug = catalogByPkg(pkg)?.slug;
  const p = pkg.toLowerCase();
  if ((slug && BROWSERS.has(slug)) || /browser|chrome|firefox|\.opera|duckduckgo|brave/.test(p)) return "browsing";
  if ((slug && FINANCE.has(slug)) || /bank|\.pay|pay\.|wallet|upi|finance|trading|invest|loan|credit|money|stock/.test(p)) return "finance";
  if ((slug && SHOPPING.has(slug)) || /shop|mart|store|amazon|flipkart|myntra|meesho|ajio|nykaa|cart|deal|blinkit|zepto|bigbasket|swiggy|zomato/.test(p)) return "shopping";
  if (/health|fit|medic|pharma|workout|yoga|sleep|period|steps|diet|calorie/.test(p)) return "lifestyle";
  if (slug && LOCATION.has(slug)) return "location";
  return null;
}

/** Vault category a captured attempt is filed under (location > kind of app > system/Ad-ID). */
export function categorize(pkg: string, kind: Kind): Category {
  if (kind === "location") return "location";
  const c = appCategory(pkg);
  if (c) return c;
  if (kind === "pixel") return "browsing";
  return kind === "app" ? "other" : "device";
}
