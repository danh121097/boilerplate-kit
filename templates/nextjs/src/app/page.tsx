"use client";

import { setLocale } from "@/i18n/i18n";
import { useTranslation } from "react-i18next";
import Link from "next/link";

/**
 * Home page — locale toggle + stack description.
 * "use client" required for react-i18next hooks.
 */
export default function HomePage() {
  const { t, i18n } = useTranslation();

  function toggleLocale() {
    const next = i18n.language === "en" ? "ja" : "en";
    setLocale(next as "en" | "ja");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
          <Link href="/" className="font-semibold hover:text-indigo-600">
            {t("nav.home")}
          </Link>
          <Link href="/counter" className="hover:text-indigo-600">
            {t("nav.counter")}
          </Link>
          <Link href="/users" className="hover:text-indigo-600">
            {t("nav.users")}
          </Link>
          <Link href="/form" className="hover:text-indigo-600">
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
        <section>
          <h1 className="mb-3 text-3xl font-bold">{t("home.welcome")} 👋</h1>
          <p className="mb-6 text-gray-600">{t("home.description")}</p>
        </section>
      </main>
    </div>
  );
}
