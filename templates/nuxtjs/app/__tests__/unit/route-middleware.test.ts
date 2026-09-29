import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "@/services/core"; // load Vue before `document` is stubbed

/**
 * Route middleware: the session hint cookie decides synchronously, before any
 * profile fetch. Nuxt globals (`defineNuxtRouteMiddleware`, `navigateTo`) and
 * `document.cookie` are stubbed.
 */

type Guard = (to: { fullPath: string; query: Record<string, unknown> }) => unknown;
let auth: Guard;
let guest: Guard;

describe("route middleware", () => {
  const navigateTo = vi.fn((target: string) => ({ redirectedTo: target }));
  const doc = { cookie: "" };

  beforeAll(async () => {
    vi.stubGlobal("defineNuxtRouteMiddleware", (fn: Guard) => fn);
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("document", doc);
    auth = (await import("@/middleware/auth")).default as unknown as Guard;
    guest = (await import("@/middleware/guest")).default as unknown as Guard;
  });

  afterEach(() => {
    navigateTo.mockClear();
    doc.cookie = "";
  });
  afterAll(() => vi.unstubAllGlobals());

  const signIn = () => (doc.cookie = "PRISM_APP_SESSION=1");

  it("auth: guest on /users → /login with the original full path", () => {
    expect(auth({ fullPath: "/users?page=2", query: {} })).toEqual({
      redirectedTo: "/login?redirect=%2Fusers%3Fpage%3D2",
    });
  });

  it("auth: a hinted session passes, even if its tokens have expired", () => {
    signIn();
    expect(auth({ fullPath: "/users", query: {} })).toBeUndefined();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("guest: a guest may open /login", () => {
    expect(guest({ fullPath: "/login", query: { redirect: "/users" } })).toBeUndefined();
  });

  it("guest: signed-in user leaves /login for the safe redirect, else home", () => {
    signIn();
    expect(guest({ fullPath: "/login", query: { redirect: "/users" } })).toEqual({
      redirectedTo: "/users",
    });
    expect(guest({ fullPath: "/login", query: { redirect: "https://evil.example" } })).toEqual({
      redirectedTo: "/",
    });
    expect(guest({ fullPath: "/login", query: {} })).toEqual({ redirectedTo: "/" });
  });
});
