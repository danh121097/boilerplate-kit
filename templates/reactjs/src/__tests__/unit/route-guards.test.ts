import { Route as loginRoute } from "@/routes/login";
import { Route as usersRoute } from "@/routes/users";
import { useAuthStore } from "@/stores/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Route guards: the synchronous session signal decides, before any profile fetch. */

// The auth store reads localStorage at import time.
vi.hoisted(() => {
  Object.assign(globalThis, {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
});

type Guard = (ctx: unknown) => void;

/** The redirect a guard threw (`href`, or `search.redirect` for `to: /login`), else null. */
function run(guard: Guard, ctx: unknown): { to?: string; href?: string; search?: unknown } | null {
  try {
    guard(ctx);
    return null;
  } catch (thrown) {
    return (thrown as { options: { to?: string; href?: string; search?: unknown } }).options;
  }
}

const usersGuard = usersRoute.options.beforeLoad as Guard;
const loginGuard = loginRoute.options.beforeLoad as Guard;

describe("route guards", () => {
  beforeEach(() => useAuthStore.setState({ isAuthenticated: false }));

  it("guest on /users → /login with the original full path", () => {
    expect(run(usersGuard, { location: { href: "/users?page=2" } })).toMatchObject({
      to: "/login",
      search: { redirect: "/users?page=2" },
    });
  });

  it("signed-in user on /users passes", () => {
    useAuthStore.setState({ isAuthenticated: true });
    expect(run(usersGuard, { location: { href: "/users" } })).toBeNull();
  });

  it("a guest may open /login", () => {
    expect(run(loginGuard, { search: { redirect: "/users" } })).toBeNull();
  });

  it("signed-in user on /login → the safe redirect, else home", () => {
    useAuthStore.setState({ isAuthenticated: true });
    expect(run(loginGuard, { search: { redirect: "/users" } })?.href).toBe("/users");
    expect(run(loginGuard, { search: { redirect: "https://evil.example" } })?.href).toBe("/");
    expect(run(loginGuard, { search: {} })?.href).toBe("/");
  });
});
