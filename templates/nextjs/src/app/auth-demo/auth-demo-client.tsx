"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLoginMutation, useLogoutMutation } from "@/services/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuthUser } from "@/services/auth/types/auth";
import type { PaginatedResponse } from "@/services/core";
import type { User } from "@/services/users/types/user";
import type { FormEvent } from "react";

interface AuthDemoClientProps {
  initialUser: AuthUser | null;
  initialUsers: PaginatedResponse<User> | null;
}

/** Auth-pending skeleton — shown while the RSC is re-rendering after login. */
function AuthPendingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-24 rounded bg-gray-100" />
    </div>
  );
}

/**
 * Client component: login/logout form + users list.
 *
 * Receives SSR-resolved data as props (no flash on load). Mutations call the
 * Express backend via the axios service layer (cookie-based, `withCredentials`).
 * After login/logout, `router.refresh()` re-runs the RSC to re-fetch server data
 * with the new cookie state — the page re-renders with fresh `initialUser` props.
 */
export function AuthDemoClient({ initialUser, initialUsers }: AuthDemoClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState("harrynguyen@admin.com");
  const [password, setPassword] = useState("Admin@123");

  const login = useLoginMutation({
    onSuccess: () => router.refresh(),
  });

  const logout = useLogoutMutation({
    onSuccess: () => router.refresh(),
  });

  if (!initialUser) {
    return (
      <section className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Cookie Auth Demo</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Login state comes from <code className="rounded bg-gray-100 px-1">GET /auth/me</code> —
            the server forwards the <code className="rounded bg-gray-100 px-1">httpOnly</code>{" "}
            cookie. No token in JS.
          </p>
        </header>

        {login.isPending ? (
          <AuthPendingSkeleton />
        ) : (
          <Card className="max-w-sm">
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                login.mutate({ email, password });
              }}
              className="space-y-3"
            >
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
                Sign in
              </Button>
              {login.isError && (
                <p className="text-sm text-red-600">
                  {login.error.message}
                  {/network|timeout|fetch/i.test(login.error.message ?? "") &&
                    " — is the Express backend running on :3000?"}
                </p>
              )}
            </form>
            <p className="mt-3 border-t pt-3 text-xs text-gray-400">
              Needs the Express template on <code>:3000</code>; run this app on the origin in the
              backend&apos;s <code>CORS_ORIGIN</code> (default <code>:3001</code>).
            </p>
          </Card>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Cookie Auth Demo</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Session resolved on the server — no token in JS; DevTools → Application → Local Storage
          stays empty (tokens live under Cookies).
        </p>
      </header>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-medium">{initialUser.name}</p>
          <p className="text-sm text-gray-500">{initialUser.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{initialUser.role}</Badge>
          <Button
            variant="danger"
            size="sm"
            onClick={() => logout.mutate(undefined)}
            disabled={logout.isPending}
          >
            {logout.isPending ? "…" : "Logout"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Users — fetched server-side with the cookie (no Bearer)</h2>
        </div>

        {/* Read the array from the PaginatedResponse envelope; treat null/empty the same way */}
        {(initialUsers?.data ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">No users returned (check backend connection).</p>
        ) : (
          <ul className="divide-y">
            {(initialUsers?.data ?? []).map((u) => (
              <li key={u.email} className="flex items-center justify-between py-2">
                <span className="font-medium">{u.name}</span>
                <span className="text-sm text-gray-500">{u.email}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
