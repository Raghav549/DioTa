import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import "@fontsource-variable/manrope";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/noto-sans-devanagari";
import "@fontsource-variable/noto-sans-bengali";
import "@fontsource-variable/noto-sans-gujarati";
import "@fontsource-variable/noto-sans-tamil";
import "@fontsource-variable/noto-sans-telugu";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { THEMES, isLang, type Theme } from "@/lib/catalog";
import { privacyShieldSource } from "@/lib/privacyShield";

export const metadata: Metadata = {
  title: "DioTa",
  description: "Your private space for digital identity, data ownership and verified rewards.",
  robots: { index: false },
};

export const viewport: Viewport = {
  themeColor: "#f8f4fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection(); // dynamic rendering so the per-request CSP nonce is applied
  const jar = await cookies();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const shield = privacyShieldSource();
  const l = jar.get("dt_lang")?.value;
  const th = jar.get("dt_theme")?.value as Theme | undefined;
  const lang = isLang(l) ? l : "en";
  const theme: Theme = th && THEMES.includes(th) ? th : "light"; // light by default
  // Android app: status / navigation bar sizes (dp) it reported, so the first paint already fits.
  const ins = /^(\d{1,3}),(\d{1,3})$/.exec(jar.get("dt_insets")?.value ?? "");
  const app = ins ? { className: "dt-app", style: { "--dt-sat": `${ins[1]}px`, "--dt-sab": `${ins[2]}px` } as CSSProperties } : {};
  return (
    <html lang={lang} data-theme={theme} {...app} suppressHydrationWarning>
      <head>
        {/* Anti-fingerprinting shield (public/privacy-shield.js): runs before every other script. */}
        {shield && <script nonce={nonce} dangerouslySetInnerHTML={{ __html: shield }} />}
      </head>
      <body className="antialiased">
        <Providers lang={lang} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
