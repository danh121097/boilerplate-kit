"use client";

import { setLocale } from "@/i18n/i18n";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import Link from "next/link";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/counter", key: "nav.counter" },
  { href: "/users", key: "nav.users" },
  { href: "/form", key: "nav.form" },
  { href: "/auth-demo", key: "nav.authDemo" },
] as const;

/** App header + nav — client component (i18n labels + locale toggle). */
export function SiteHeader() {
  const { t, i18n } = useTranslation();
  const pathname = usePathname();

  const toggleLocale = () => setLocale(i18n.language === "en" ? "ja" : "en");

  return (
    <header className="border-b bg-white">
      <nav className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        {NAV.map(({ href, key }) => {
          const home = href === "/";
          const active = home ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`hover:text-indigo-600 ${home ? "font-semibold " : ""}${active ? "text-indigo-600" : ""}`}
            >
              {t(key)}
            </Link>
          );
        })}
        <button
          className="ml-auto rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          onClick={toggleLocale}
        >
          {i18n.language.toUpperCase()}
        </button>
      </nav>
    </header>
  );
}
