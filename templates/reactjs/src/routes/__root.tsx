import { setLocale } from "@/i18n/i18n";
import { authContract } from "@/services/auth/contract";
import { loginPathWithReturn, redirectOnSessionExpired } from "@/services/core";
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

  // An expired auth session (refresh refused) routes to /login instead of
  // reloading, carrying the current path so the login page can bring the user
  // back. Another service's session end does not sign the user out.
  useEffect(
    () =>
      redirectOnSessionExpired(() => {
        const { pathname, href } = router.state.location;
        if (pathname !== "/login") void navigate({ href: loginPathWithReturn(href) });
      }, authContract.service),
    [navigate, router],
  );

  // Login/logout in another tab → recompute the session here. A remote logout
  // on a protected page goes to /login without a return path (the user chose
  // to sign out); otherwise the route guards (`beforeLoad`) re-run.
  useEffect(
    () =>
      syncAuthWithOtherTabs(() => {
        const signedOut = !useAuthStore.getState().isAuthenticated;
        const onProtectedPage = router.state.matches.some((m) => m.staticData.requiresAuth);
        if (signedOut && onProtectedPage) void navigate({ to: "/login" });
        else void router.invalidate();
      }),
    [navigate, router],
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
    </div>
  );
}
