import { Providers } from "@/app/providers";
import { SessionAlert } from "@/components/session-banner";
import { SiteHeader } from "@/components/site-header";
import { STORAGE_KEYS } from "@/enums";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Next.js Starter",
  description:
    "Next.js 16 + TypeScript SSR starter — App Router, TanStack Query, Zustand, shadcn/ui, Tailwind v4, JWT Auth",
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Root layout — server component. Reads the LANGUAGE cookie on the server so the
 * `<html lang>` and the i18n instance render in the right locale on first paint
 * (no flash, no hydration drift). Reading a per-request cookie opts the app into
 * dynamic rendering — expected for a cookie-personalized SSR app.
 */
export default async function RootLayout({ children }: RootLayoutProps) {
  const lang =
    (await cookies()).get(STORAGE_KEYS.LANGUAGE)?.value ??
    process.env.NEXT_PUBLIC_LANGUAGE_CODE ??
    "en";

  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground" suppressHydrationWarning>
        <Providers initialLanguage={lang}>
          <SiteHeader />
          <main className="mx-auto max-w-3xl px-6 py-8">
            <SessionAlert />
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
