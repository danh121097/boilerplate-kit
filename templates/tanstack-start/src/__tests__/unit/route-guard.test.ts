import { STORAGE_KEYS } from "@/enums";
import { redirectIfSignedIn, requireSession } from "@/services/core/route-guard";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Route guards: the session hint cookie decides, before any profile fetch. */

const jar = new Map<string, string>();

vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => jar.get(name),
}));

/** The redirect a guard threw (`href`), or null when it let the request through. */
function run(guard: () => void): string | null {
  try {
    guard();
    return null;
  } catch (thrown) {
    return (thrown as { options: { href: string } }).options.href;
  }
}

describe("route guards", () => {
  beforeEach(() => jar.clear());

  const signIn = () => jar.set(STORAGE_KEYS.SESSION, "1");

  it("guest on /users → /login with the original full path", () => {
    expect(run(() => requireSession({ href: "/users?page=2" }))).toBe(
      "/login?redirect=%2Fusers%3Fpage%3D2",
    );
  });

  it("a hinted session passes a protected route, even if its tokens have expired", () => {
    signIn();
    expect(run(() => requireSession({ href: "/users" }))).toBeNull();
  });

  it("a guest may open /login", () => {
    expect(run(() => redirectIfSignedIn({ redirect: "/users" }))).toBeNull();
  });

  it("signed-in user leaves /login for the safe redirect, else home", () => {
    signIn();
    expect(run(() => redirectIfSignedIn({ redirect: "/users" }))).toBe("/users");
    expect(run(() => redirectIfSignedIn({ redirect: "https://evil.example" }))).toBe("/");
    expect(run(() => redirectIfSignedIn({}))).toBe("/");
  });
});
