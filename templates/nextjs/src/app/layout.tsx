import { Providers } from "./providers";
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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
