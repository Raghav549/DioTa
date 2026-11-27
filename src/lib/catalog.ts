// Client-safe constants shared by the UI and the API.
export const CATEGORIES = ["finance", "shopping", "location", "browsing", "lifestyle", "device", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const MODES = ["private", "selected", "disabled"] as const;
export type Mode = (typeof MODES)[number];

export const PERMISSIONS = ["location", "camera", "microphone", "contacts", "photos", "sms", "phone", "calendar", "notifications"] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const SENSITIVE: readonly string[] = ["location", "camera", "microphone", "contacts", "sms", "phone"];

export const CATEGORY_COLORS: Record<Category, { from: string; to: string }> = {
  finance: { from: "#34d399", to: "#059669" },
  shopping: { from: "#fb7185", to: "#e11d48" },
  location: { from: "#fbbf24", to: "#d97706" },
  browsing: { from: "#c084fc", to: "#9333ea" },
  lifestyle: { from: "#f472b6", to: "#c026d3" },
  device: { from: "#2dd4bf", to: "#0f9488" },
  other: { from: "#a8a1b8", to: "#6b6480" },
};

/** Apps with a built-in real brand logo (public/logos, from simple-icons). `pkg` is the Android package name,
 * used to match apps found on the phone. Any other installed app can be tracked too (it uses its icon from the phone). */
export const APPS = [
  { slug: "whatsapp", name: "WhatsApp", pkg: "com.whatsapp" },
  { slug: "instagram", name: "Instagram", pkg: "com.instagram.android" },
  { slug: "youtube", name: "YouTube", pkg: "com.google.android.youtube" },
  { slug: "facebook", name: "Facebook", pkg: "com.facebook.katana" },
  { slug: "messenger", name: "Messenger", pkg: "com.facebook.orca" },
  { slug: "telegram", name: "Telegram", pkg: "org.telegram.messenger" },
  { slug: "snapchat", name: "Snapchat", pkg: "com.snapchat.android" },
  { slug: "x", name: "X (Twitter)", pkg: "com.twitter.android" },
  { slug: "threads", name: "Threads", pkg: "com.instagram.barcelona" },
  { slug: "signal", name: "Signal", pkg: "org.thoughtcrime.securesms" },
  { slug: "discord", name: "Discord", pkg: "com.discord" },
  { slug: "pinterest", name: "Pinterest", pkg: "com.pinterest" },
  { slug: "reddit", name: "Reddit", pkg: "com.reddit.frontpage" },
  { slug: "quora", name: "Quora", pkg: "com.quora.android" },
  { slug: "tumblr", name: "Tumblr", pkg: "com.tumblr" },
  { slug: "tiktok", name: "TikTok", pkg: "com.zhiliaoapp.musically" },
  { slug: "tinder", name: "Tinder", pkg: "com.tinder" },
  { slug: "wechat", name: "WeChat", pkg: "com.tencent.mm" },
  { slug: "line", name: "LINE", pkg: "jp.naver.line.android" },
  { slug: "viber", name: "Viber", pkg: "com.viber.voip" },
  { slug: "zoom", name: "Zoom", pkg: "us.zoom.videomeetings" },
  { slug: "googlemeet", name: "Google Meet", pkg: "com.google.android.apps.tachyon" },
  { slug: "gmail", name: "Gmail", pkg: "com.google.android.gm" },
  { slug: "googlemessages", name: "Google Messages", pkg: "com.google.android.apps.messaging" },
  { slug: "netflix", name: "Netflix", pkg: "com.netflix.mediaclient" },
  { slug: "spotify", name: "Spotify", pkg: "com.spotify.music" },
  { slug: "youtubemusic", name: "YouTube Music", pkg: "com.google.android.apps.youtube.music" },
  { slug: "soundcloud", name: "SoundCloud", pkg: "com.soundcloud.android" },
  { slug: "shazam", name: "Shazam", pkg: "com.shazam.android" },
  { slug: "twitch", name: "Twitch", pkg: "tv.twitch.android.app" },
  { slug: "audible", name: "Audible", pkg: "com.audible.application" },
  { slug: "vlcmediaplayer", name: "VLC", pkg: "org.videolan.vlc" },
  { slug: "swiggy", name: "Swiggy", pkg: "in.swiggy.android" },
  { slug: "zomato", name: "Zomato", pkg: "com.application.zomato" },
  { slug: "bigbasket", name: "bigbasket", pkg: "com.bigbasket.mobileapp" },
  { slug: "uber", name: "Uber", pkg: "com.ubercab" },
  { slug: "airbnb", name: "Airbnb", pkg: "com.airbnb.android" },
  { slug: "bookmyshow", name: "BookMyShow", pkg: "com.bt.bms" },
  { slug: "ebay", name: "eBay", pkg: "com.ebay.mobile" },
  { slug: "aliexpress", name: "AliExpress", pkg: "com.alibaba.aliexpresshd" },
  { slug: "phonepe", name: "PhonePe", pkg: "com.phonepe.app" },
  { slug: "googlepay", name: "Google Pay", pkg: "com.google.android.apps.nbu.paisa.user" },
  { slug: "paytm", name: "Paytm", pkg: "net.one97.paytm" },
  { slug: "paypal", name: "PayPal", pkg: "com.paypal.android.p2pmobile" },
  { slug: "zerodha", name: "Zerodha Kite", pkg: "com.zerodha.kite3" },
  { slug: "hdfcbank", name: "HDFC Bank", pkg: "com.snapwork.hdfc" },
  { slug: "icicibank", name: "ICICI iMobile", pkg: "com.csam.icici.bank.imobile" },
  { slug: "jio", name: "MyJio", pkg: "com.jio.myjio" },
  { slug: "airtel", name: "Airtel Thanks", pkg: "com.myairtelapp" },
  { slug: "vodafone", name: "Vi", pkg: "com.mventus.selfcare.activity" },
  { slug: "googlemaps", name: "Google Maps", pkg: "com.google.android.apps.maps" },
  { slug: "googlechrome", name: "Chrome", pkg: "com.android.chrome" },
  { slug: "firefox", name: "Firefox", pkg: "org.mozilla.firefox" },
  { slug: "brave", name: "Brave", pkg: "com.brave.browser" },
  { slug: "opera", name: "Opera", pkg: "com.opera.browser" },
  { slug: "duckduckgo", name: "DuckDuckGo", pkg: "com.duckduckgo.mobile.android" },
  { slug: "googledrive", name: "Google Drive", pkg: "com.google.android.apps.docs" },
  { slug: "googlephotos", name: "Google Photos", pkg: "com.google.android.apps.photos" },
  { slug: "googlecalendar", name: "Google Calendar", pkg: "com.google.android.calendar" },
  { slug: "googlekeep", name: "Google Keep", pkg: "com.google.android.keep" },
  { slug: "googletranslate", name: "Google Translate", pkg: "com.google.android.apps.translate" },
  { slug: "googlehome", name: "Google Home", pkg: "com.google.android.apps.chromecast.app" },
  { slug: "dropbox", name: "Dropbox", pkg: "com.dropbox.android" },
  { slug: "notion", name: "Notion", pkg: "notion.id" },
  { slug: "evernote", name: "Evernote", pkg: "com.evernote" },
  { slug: "duolingo", name: "Duolingo", pkg: "com.duolingo" },
] as const;

export const isCatalogSlug = (s: string) => APPS.some((a) => a.slug === s);
/** Android package name, e.g. com.example.app. Apps found on the phone that are not in the catalog use it as their slug. */
export const PKG_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/;
export const isPackageSlug = (s: string) => s.length <= 150 && PKG_RE.test(s) && !isCatalogSlug(s);
export const isAppSlug = (s: string) => isCatalogSlug(s) || isPackageSlug(s);
export const catalogByPkg = (pkg: string) => APPS.find((a) => a.pkg === pkg);
export const appName = (slug: string, stored?: string | null) => APPS.find((a) => a.slug === slug)?.name ?? stored ?? slug;

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
