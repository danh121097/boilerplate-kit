/// <reference types="vite/client" />
import { NotFound } from "@/components/not-found";
import { SocketStatus } from "@/components/socket-status";
import { setLocale } from "@/i18n/i18n";
import { authContract, useLogoutMutation } from "@/services/auth";
import { useAuth } from "@/services/auth/session";
import { resetQueriesOnSessionEnd, resyncQueriesAfterLogin } from "@/services/core/query-client";
import {
  loginPathWithReturn,
  redirectOnSessionExpired,
  syncAuthAcrossTabs,
} from "@/services/core/session";
import { queryKeys } from "@/services/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import appCss from "@/styles/tailwind.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

/**
 * Root route — defines the full HTML document shell.
 *
 * The modern TanStack Start (Vite-based) API requires the root route to render
 * the complete HTML document. This replaces the old vinxi pattern where client.tsx and ssr.tsx
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
  notFoundComponent: NotFound,
});

// The import itself is gated on the production constant: a production build has no
// badge code at all, not even an inert branch.
const MockAuthBadge = import.meta.env.PROD
  ? null
  : lazy(() => import("@/components/mock-auth-badge").then((m) => ({ default: m.MockAuthBadge })));

/** Header link: muted until hovered or on the active route (`.active` from the router). */
const navLink =
  "text-muted-foreground hover:text-primary [&.active]:font-medium [&.active]:text-primary";

function RootLayout() {
  const logout = useLogoutMutation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const auth = useAuth();

  const { i18n, t } = useTranslation();

  // Session subscriptions run in effects (browser only, cleaned up on unmount and
  // HMR) rather than in `getRouter()`, which re-runs on HMR and would stack them.

  // Logout / refused refresh of the auth service → reset the cache in place and
  // pin `auth.me` to null. Another service's session ending leaves it alone.
  useEffect(
    () => resetQueriesOnSessionEnd(queryClient, queryKeys.auth.me, authContract.service),
    [queryClient],
  );

  // Refused refresh (session expired) → /login, carrying the current location
  // (path, query and hash) so the login page can bring the user back. No reload.
  useEffect(
    () =>
      redirectOnSessionExpired(() => {
        const { pathname, href } = router.state.location;
        if (pathname !== "/login") void router.navigate({ href: loginPathWithReturn(href) });
      }, authContract.service),
    [router],
  );

  // Login/logout in another tab → re-run the route loaders here; a login also
  // re-reads the session. On a logout the session-end listener above has
  // already reset every query to signed-out; the invalidate re-runs the route
  // guards, so a protected page redirects to /login.
  useEffect(
    () =>
      syncAuthAcrossTabs({
        onLogin: () => {
          resyncQueriesAfterLogin(queryClient, queryKeys.auth.me);
          void router.invalidate();
        },
        onLogout: () => void router.invalidate(),
      }),
    [queryClient, router],
  );

  function toggleLocale() {
    const next = i18n.language === "en" ? "ja" : "en";
    setLocale(next as "en" | "ja");
  }

  return (
    // `lang` comes from the LANGUAGE cookie, resolved on the server too, so SSR and
    // client agree. suppressHydrationWarning still guards browser extensions that
    // mutate <html>/<body> attributes before React hydrates — not a real mismatch.
    <html lang={i18n.language} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground" suppressHydrationWarning>
        <header className="border-b border-border bg-card">
          <nav className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-3 text-sm">
            <Link to="/" activeOptions={{ exact: true }} className={cn(navLink, "font-semibold")}>
              {t("nav.home")}
            </Link>
            <Link to="/counter" className={navLink}>
              {t("nav.counter")}
            </Link>
            <Link to="/users" className={navLink}>
              {t("nav.users")}
            </Link>
            <Link to="/form" className={navLink}>
              {t("nav.form")}
            </Link>
            {auth.isAuthenticated ? (
              <div className="ml-auto flex items-center gap-3">
                <SocketStatus />
                <Button
                  variant="unstyled"
                  className="hover:text-primary"
                  // Signed out either way (the client session ends even when the
                  // request fails): go to plain /login, no return path.
                  onClick={() =>
                    logout.mutate(undefined, {
                      onSettled: () => void router.navigate({ to: "/login" }),
                    })
                  }
                  disabled={logout.isPending}
                >
                  {t("nav.logout")}
                </Button>
              </div>
            ) : (
              <Link to="/login" className={cn(navLink, "ml-auto")}>
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
        </header>
        <main className="mx-auto max-w-3xl px-6 py-8">
          {auth.sessionUnavailable && (
            <p
              role="alert"
              className="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
            >
              {t("session.unavailable")}
              <Button variant="unstyled" className="ml-auto underline" onClick={auth.retrySession}>
                {t("session.retry")}
              </Button>
            </p>
          )}
          <Outlet />
        </main>
        {MockAuthBadge && (
          <Suspense fallback={null}>
            <MockAuthBadge />
          </Suspense>
        )}
        <Scripts />
      </body>
    </html>
  );
}
