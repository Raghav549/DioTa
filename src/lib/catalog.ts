// Client-safe constants shared by the UI and the API.
export const CATEGORIES = ["finance", "shopping", "location", "browsing", "lifestyle", "device", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MODES = ["private", "selected", "disabled"] as const;
export type Mode = (typeof MODES)[number];

export const PERMISSIONS = ["location", "camera", "microphone", "contacts", "photos", "sms", "calendar", "notifications"] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const SENSITIVE: readonly string[] = ["location", "camera", "microphone", "contacts", "sms"];

export const CATEGORY_COLORS: Record<Category, { from: string; to: string }> = {
  finance: { from: "#34d399", to: "#059669" },
  shopping: { from: "#fb7185", to: "#e11d48" },
  location: { from: "#fbbf24", to: "#d97706" },
  browsing: { from: "#c084fc", to: "#9333ea" },
  lifestyle: { from: "#f472b6", to: "#c026d3" },
  device: { from: "#2dd4bf", to: "#0f9488" },
  other: { from: "#a8a1b8", to: "#6b6480" },
};

export const APPS = [
  { slug: "whatsapp", name: "WhatsApp" },
  { slug: "instagram", name: "Instagram" },
  { slug: "youtube", name: "YouTube" },
  { slug: "spotify", name: "Spotify" },
  { slug: "netflix", name: "Netflix" },
  { slug: "swiggy", name: "Swiggy" },
  { slug: "zomato", name: "Zomato" },
  { slug: "uber", name: "Uber" },
  { slug: "snapchat", name: "Snapchat" },
  { slug: "phonepe", name: "PhonePe" },
  { slug: "gmail", name: "Gmail" },
  { slug: "pinterest", name: "Pinterest" },
  { slug: "reddit", name: "Reddit" },
] as const;

export const appName = (slug: string) => APPS.find((a) => a.slug === slug)?.name ?? slug;
export const isAppSlug = (s: string) => APPS.some((a) => a.slug === s);

export const LANGS = [
  { code: "en", native: "English", locale: "en-IN" },
  { code: "hi", native: "हिन्दी", locale: "hi-IN" },
  { code: "bn", native: "বাংলা", locale: "bn-IN" },
  { code: "gu", native: "ગુજરાતી", locale: "gu-IN" },
  { code: "ne", native: "नेपाली", locale: "ne-NP" },
  { code: "ta", native: "தமிழ்", locale: "ta-IN" },
  { code: "te", native: "తెలుగు", locale: "te-IN" },
] as const;
export type LangCode = (typeof LANGS)[number]["code"];
export const isLang = (s: string | undefined | null): s is LangCode => !!s && LANGS.some((l) => l.code === s);

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const CONSENT_VERSION = "2026-01";
