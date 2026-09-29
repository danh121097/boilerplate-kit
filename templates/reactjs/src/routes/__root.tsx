import { setLocale } from "@/i18n/i18n";
import { setupSessionExpiry } from "@/services/session-expiry";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

// The import itself is gated on the production constant: a production build has no
// badge code at all, not even an inert branch.
const MockAuthBadge = import.meta.env.PROD
  ? null
  : lazy(() => import("@/components/mock-auth-badge").then((m) => ({ default: m.MockAuthBadge })));

function RootLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();
  const navigate = useNavigate();
  const hydrate = useAuthStore((s) => s.hydrate);
  const logout = useAuthStore((s) => s.logout);

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

  async function onLogout() {
    await logout();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
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
          {isAuthenticated ? (
            <Button variant="unstyled" className="ml-auto hover:text-indigo-600" onClick={onLogout}>
              {t("nav.logout")}
            </Button>
          ) : (
            <Link to="/login" className="ml-auto hover:text-indigo-600 [&.active]:text-indigo-600">
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
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
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
