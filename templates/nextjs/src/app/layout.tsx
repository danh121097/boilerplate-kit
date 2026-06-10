import { Providers } from "./providers";
import { SiteHeader } from "@/components/site-header";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next.js Starter",
  description:
    "Next.js 16 + TypeScript SSR starter — App Router, TanStack Query, Zustand, shadcn/ui, Tailwind v4, JWT auth",
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Root layout — server component. Wraps the entire app in client-side providers
 * (React Query + i18n) via the "use client" Providers boundary.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900" suppressHydrationWarning>
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
