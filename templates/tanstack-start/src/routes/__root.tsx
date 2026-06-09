/// <reference types="vite/client" />
import { setLocale } from "@/i18n/i18n";
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "@/styles/tailwind.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Root route — defines the full HTML document shell.
 *
 * The modern TanStack Start (Vite-based) API requires the root route to render
 * the complete HTML document: <html>, <head>, <body>, <HeadContent />, and
 * <Scripts />. This replaces the old vinxi pattern where client.tsx and ssr.tsx
 * managed the document shell separately.
 *
 * head() injects the stylesheet link server-side so the first paint is styled.
 * Scripts renders the hydration payloads and module preload tags.
 */
export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "TanStack Start Starter" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootLayout,
});

function RootLayout() {
  const { t, i18n } = useTranslation();

  function toggleLocale() {
    const next = i18n.language === "en" ? "ja" : "en";
    setLocale(next as "en" | "ja");
  }

  return (
    <html lang={i18n.language}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
            <Link to="/" className="font-semibold hover:text-indigo-600 [&.active]:text-indigo-600">
              {t("nav.home")}
            </Link>
            <Link to="/counter" className="hover:text-indigo-600 [&.active]:text-indigo-600">
              {t("nav.counter")}
            </Link>
            <Link to="/users" className="hover:text-indigo-600 [&.active]:text-indigo-600">
              {t("nav.users")}
            </Link>
            <Link to="/form" className="hover:text-indigo-600 [&.active]:text-indigo-600">
              {t("nav.form")}
            </Link>
            <button
              className="ml-auto rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
              onClick={toggleLocale}
            >
              {i18n.language.toUpperCase()}
            </button>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          <Outlet />
        </main>
        <Scripts />
      </body>
    </html>
  );
}
