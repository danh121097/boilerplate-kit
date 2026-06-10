import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth, useLoginMutation, useLogoutMutation, useSessionQuery } from "@/services/auth";
import { useUsersListQuery } from "@/services/users";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

/**
 * Cookie-auth demo (SSR session + CSR login).
 *
 * Demonstrates the cookie-first flow end-to-end against the Express backend:
 *  1. The route loader resolves the session ON THE SERVER (`getMeServerFn` forwards
 *     the request cookie to GET /auth/me) — there is NO token in JS to read, login
 *     state is DERIVED from the server's answer and rendered without a flash.
 *       user → already logged in (skip the form); null → show login.
 *  2. Login → the backend sets httpOnly cookies; `auth.me` is invalidated so the
 *     session re-resolves and the UI flips to the logged-in view.
 *  3. The users request authenticates with the cookie alone (`withCredentials`).
 *  4. Logout → the backend clears the cookies; `auth.me` re-resolves → null → form.
 *
 * Requires the Express template running and these env vars (see `.env.example`):
 *   VITE_API_BASE_URL=http://localhost:3000/api/v1
 *   VITE_HMAC_SECRET=<must equal the backend HMAC_SECRET>
 */
export const Route = createFileRoute("/auth-demo")({
  // Resolve the session on the server so the page renders the right auth state.
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(useSessionQuery.queryOptions()),
  component: AuthDemoPage,
});

function AuthDemoPage() {
  const [email, setEmail] = useState("harrynguyen@admin.com");
  const [password, setPassword] = useState("Admin@123");

  // `isAuthenticated`/`user` are DERIVED from the session query (prefetched by the
  // loader, hydrated here — no flash); they can never drift from the real cookie.
  const { user, isAuthenticated, isLoading } = useAuth();

  const login = useLoginMutation();
  const logout = useLogoutMutation();
  // Users need the auth cookie, so only fetch once the session is confirmed.
  const users = useUsersListQuery({ enabled: isAuthenticated });

  function handleLogin(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }); // invalidates auth.me → re-checks session
  }

  function handleLogout() {
    logout.mutate(undefined); // invalidates auth.me → back to the login form
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cookie Auth Demo</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Login state comes from <code className="rounded bg-gray-100 px-1">GET /auth/me</code> —
          the browser sends the <code className="rounded bg-gray-100 px-1">httpOnly</code> cookie,
          the server answers who you are. No token in JS; DevTools → Application → Local Storage
          stays empty (the tokens live under Cookies).
        </p>
      </header>

      {isLoading ? (
        <p className="text-gray-500">Checking session…</p>
      ) : !user ? (
        <Card className="max-w-sm">
          <form onSubmit={handleLogin} className="space-y-3">
            <h2 className="font-semibold">Login</h2>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
            />
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </Button>
            {login.isError && (
              <p className="text-sm text-red-600">
                {login.error.message}
                {/network|timeout|fetch/i.test(login.error.message ?? "") &&
                  " — is the Express backend running on :3000, and is this app on the CORS-allowed origin (default :5173)?"}
              </p>
            )}
          </form>
          <p className="mt-3 border-t pt-3 text-xs text-gray-400">
            Needs the Express template running on <code>:3000</code>; run this app on the origin in
            the backend&apos;s <code>CORS_ORIGIN</code> (default <code>:5173</code>).
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="flex items-center justify-between">
            <div>
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{user.role}</Badge>
              <Button variant="danger" size="sm" onClick={handleLogout} disabled={logout.isPending}>
                {logout.isPending ? "…" : "Logout"}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Users — fetched with the cookie (no Bearer)</h2>
              <Button variant="secondary" size="sm" onClick={() => users.refetch()}>
                Refresh
              </Button>
            </div>

            {users.isLoading && <p className="text-gray-500">Loading…</p>}
            {users.error && <p className="text-red-600">{users.error.message}</p>}

            {users.data && (
              <>
                <p className="mb-2 text-sm text-gray-500">
                  Page {users.data.meta.page}/{users.data.meta.totalPages} · {users.data.meta.total}{" "}
                  total
                </p>
                <ul className="divide-y">
                  {users.data.data.map((u) => (
                    <li key={u.email} className="flex items-center justify-between py-2">
                      <span className="font-medium">{u.name}</span>
                      <span className="text-sm text-gray-500">{u.email}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
