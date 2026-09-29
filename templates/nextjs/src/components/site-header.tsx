"use client";

import { SocketStatus } from "@/components/socket-status";
import { Button } from "@/components/ui/button";
import { setLocale } from "@/i18n/i18n";
import { useLogoutMutation } from "@/services/auth";
import { useAuth } from "@/services/auth/session";
import { cn } from "@/utils";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import dynamic from "next/dynamic";
import Link from "next/link";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/counter", key: "nav.counter" },
  { href: "/users", key: "nav.users" },
  { href: "/form", key: "nav.form" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// The import itself is gated on the production constant: a production build has no
// badge code at all, not even an inert branch.
const MockAuthBadge =
  process.env.NODE_ENV !== "production"
    ? dynamic(() => import("@/components/mock-auth-badge").then((m) => m.MockAuthBadge))
    : null;

/** Nav link classes — the current route is highlighted with the primary token. */
function navLinkClass(active: boolean, extra?: string) {
  return cn(
    "hover:text-primary",
    active ? "font-semibold text-primary" : "text-muted-foreground",
    extra,
  );
}

/** App header + nav — client component (i18n labels + locale toggle + auth). */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogoutMutation();

  const { i18n, t } = useTranslation();

  const toggleLocale = () => setLocale(i18n.language === "en" ? "ja" : "en");

  const { isAuthenticated } = useAuth();

  return (
    <header className="border-b border-border bg-card">
      <nav className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
        {NAV.map(({ href, key }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(pathname, href) ? "page" : undefined}
            className={navLinkClass(isActive(pathname, href))}
          >
            {t(key)}
          </Link>
        ))}
        {isAuthenticated ? (
          <div className="ml-auto flex items-center gap-3">
            <SocketStatus />
            <Button
              variant="unstyled"
              className={navLinkClass(false)}
              // Signed out either way (the client session ends even when the
              // request fails): go to plain /login, no return path.
              onClick={() => logout.mutate(undefined, { onSettled: () => router.push("/login") })}
              disabled={logout.isPending}
            >
              {t("nav.logout")}
            </Button>
          </div>
        ) : (
          <Link href="/login" className={navLinkClass(isActive(pathname, "/login"), "ml-auto")}>
            {t("nav.login")}
          </Link>
        )}
        <Button
          variant="unstyled"
          className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent"
          onClick={toggleLocale}
        >
          {i18n.language.toUpperCase()}
        </Button>
      </nav>
      {MockAuthBadge && <MockAuthBadge />}
    </header>
  );
}
