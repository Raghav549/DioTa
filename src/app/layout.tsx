import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import "@fontsource-variable/manrope";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { THEMES, isLang, type Theme } from "@/lib/catalog";

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
  const l = jar.get("dt_lang")?.value;
  const th = jar.get("dt_theme")?.value as Theme | undefined;
  const lang = isLang(l) ? l : "en";
  const theme: Theme = th && THEMES.includes(th) ? th : "light"; // light by default
  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning>
      <body className="antialiased">
        <Providers lang={lang} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
