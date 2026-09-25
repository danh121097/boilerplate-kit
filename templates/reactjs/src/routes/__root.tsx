import { setLocale } from "@/i18n/i18n";
import { onSessionEnded } from "@/services/core";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

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

  // An expired session (refresh failed) routes to /login instead of reloading,
  // carrying the current path so the login page can bring the user back.
  useEffect(
    () =>
      onSessionEnded((reason) => {
        const { pathname, href } = router.state.location;
        if (reason === "expired" && pathname !== "/login") {
          void navigate({ to: "/login", search: { redirect: href } });
        }
      }),
    [navigate, router],
  );

  // Login/logout in another tab → recompute the session here and re-run the
  // route guards (`beforeLoad`), e.g. bounce a protected page to /login.
  useEffect(() => syncAuthWithOtherTabs(() => void router.invalidate()), [router]);

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
    </div>
  );
}
