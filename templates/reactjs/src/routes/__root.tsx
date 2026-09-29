import { NotFound } from "@/components/not-found";
import { setLocale } from "@/i18n/i18n";
import { useLogoutMutation } from "@/services/auth";
import { setupSessionExpiry } from "@/services/session-expiry";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const hydrateError = useAuthStore((s) => s.hydrateError);
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const hydrate = useAuthStore((s) => s.hydrate);
  const retryHydrate = useAuthStore((s) => s.retryHydrate);

  const { i18n, t } = useTranslation();

  // Resolve the persisted session once on boot so the nav reflects it.
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Session end → /login: with a return path when it expired, without one on
  // a protected page when another tab logged out. Never reloads.
  useEffect(() => setupSessionExpiry(router), [router]);

  // Login in another tab → recompute the session here and re-run the route
  // guards (`beforeLoad`). A remote logout is handled by the listener above.
  useEffect(
    () =>
      syncAuthWithOtherTabs(() => {
        if (useAuthStore.getState().isAuthenticated) void router.invalidate();
      }),
    [router],
  );

  function toggleLocale() {
    const next = i18n.language === "en" ? "ja" : "en";
    setLocale(next as "en" | "ja");
  }

  // Signed out either way (the client session ends even when the request
  // fails): go to plain /login, no return path.
  function onLogout() {
    logout.mutate(undefined, { onSettled: () => void navigate({ to: "/login" }) });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
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
          {isAuthenticated ? (
            <Button
              variant="unstyled"
              className="ml-auto hover:text-primary"
              disabled={logout.isPending}
              onClick={onLogout}
            >
              {t("nav.logout")}
            </Button>
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
        {hydrateError && (
          <p
            role="alert"
            className="mb-4 flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm"
          >
            {t("session.unavailable")}
            <Button variant="unstyled" className="ml-auto underline" onClick={retryHydrate}>
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
    </div>
  );
}
