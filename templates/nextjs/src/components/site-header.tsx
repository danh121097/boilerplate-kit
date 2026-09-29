"use client";

import { Button } from "@/components/ui/button";
import { setLocale } from "@/i18n/i18n";
import { useLogoutMutation } from "@/services/auth";
import { isMockAuthEnabled } from "@/services/auth/mock-auth";
import { useAuth } from "@/services/auth/session";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import Link from "next/link";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/counter", key: "nav.counter" },
  { href: "/users", key: "nav.users" },
  { href: "/form", key: "nav.form" },
] as const;

// Folds to false in a production build, so the badge is tree-shaken.
const mockAuth = process.env.NODE_ENV !== "production" && isMockAuthEnabled();

/** App header + nav — client component (i18n labels + locale toggle + auth). */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogoutMutation();

  const { i18n, t } = useTranslation();

  const toggleLocale = () => setLocale(i18n.language === "en" ? "ja" : "en");

  const { isAuthenticated } = useAuth();

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
        {isAuthenticated ? (
          <Button
            variant="unstyled"
            className="ml-auto hover:text-indigo-600"
            // Signed out either way (the client session ends even when the
            // request fails): go to plain /login, no return path.
            onClick={() => logout.mutate(undefined, { onSettled: () => router.push("/login") })}
            disabled={logout.isPending}
          >
            {t("nav.logout")}
          </Button>
        ) : (
          <Link href="/login" className="ml-auto hover:text-indigo-600">
            {t("nav.login")}
          </Link>
        )}
        <Button
          variant="unstyled"
          className="rounded-md border px-2 py-0.5 text-xs hover:bg-gray-100"
          onClick={toggleLocale}
        >
          {i18n.language.toUpperCase()}
        </Button>
      </nav>
      {mockAuth && (
        <span
          role="status"
          title="NEXT_PUBLIC_AUTH_MOCK is on: sign-in is answered in the browser, not by the backend"
          className="fixed bottom-3 left-3 z-50 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-300"
        >
          Mock auth
        </span>
      )}
    </header>
  );
}
