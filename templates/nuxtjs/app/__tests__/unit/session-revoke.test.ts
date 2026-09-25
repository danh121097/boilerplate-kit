import { AuthModel } from "@/services/auth";
import { endSession, getSessionEpoch, hasSessionHint, onSessionEnded } from "@/services/core";
import { QueryClient } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How a session ends: a session the server rejects on a browser-side session
 * read is revoked and ends as "expired" (the login redirect keeps a return
 * path); only a voluntary logout ends as "logout". The expiry plugin is
 * registered with Nuxt globals (`defineNuxtPlugin`, `navigateTo`, `useRouter`),
 * `document.cookie` and `localStorage` stubbed.
 */

type PluginFn = (nuxtApp: unknown) => void;

const HINT = "PRISM_APP_SESSION=1";
const unauthorized = { error_code: 401, message: "expired" };

describe("session end reasons", () => {
  const navigateTo = vi.fn();
  const queryClient = new QueryClient();
  const doc = { cookie: "" };
  const storage = new Map<string, string>();
  const stops: Array<() => void> = [];

  const watchEnds = () => {
    const ended = vi.fn();
    stops.push(onSessionEnded(ended));
    return ended;
  };

  beforeAll(async () => {
    vi.stubGlobal("defineNuxtPlugin", (fn: PluginFn) => fn);
    vi.stubGlobal("navigateTo", navigateTo);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.stubGlobal("useRouter", () => ({
      currentRoute: { value: { path: "/users", fullPath: "/users?page=2" } },
    }));
    const plugin = (await import("@/plugins/04.session-expiry.client"))
      .default as unknown as PluginFn;
    plugin({ $queryClient: queryClient, runWithContext: (fn: () => unknown) => fn() });
  });

  beforeEach(() => {
    doc.cookie = HINT; // signed in
    storage.clear();
  });

  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
    navigateTo.mockReset();
    vi.restoreAllMocks();
  });

  afterAll(() => vi.unstubAllGlobals());

  it("a boot 401 with a live session revokes it and ends it as expired with a return path", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: "/auth/logout" }));
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(hasSessionHint()).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it("a boot 401 after the session already ended does not post logout", async () => {
    vi.spyOn(AuthModel, "getMe").mockImplementation(async () => {
      // A refused refresh ended the session while the profile request ran.
      endSession("expired", "MAIN");
      throw unauthorized;
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();

    await expect(AuthModel.getSession()).resolves.toBeNull();

    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN"); // the refresh's, only
  });

  it("an anonymous visitor's 401 posts nothing", async () => {
    doc.cookie = "";
    vi.spyOn(AuthModel, "getMe").mockRejectedValue(unauthorized);
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = watchEnds();

    await expect(AuthModel.getSession()).resolves.toBeNull();
    await expect(AuthModel.revokeSession()).resolves.toBe(false);

    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("revoking after the epoch moved resolves false and posts nothing", async () => {
    const post = vi.spyOn(AuthModel.api, "post");
    const sinceEpoch = getSessionEpoch("MAIN");
    endSession("expired", "MAIN");
    doc.cookie = HINT; // e.g. signed in again meanwhile

    await expect(AuthModel.revokeSession(sinceEpoch)).resolves.toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("concurrent revokes post logout once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const first = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    const second = AuthModel.revokeSession();
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    finish();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("a logout during an in-flight revoke posts once and ends the session once", async () => {
    let finish!: () => void;
    const post = vi
      .spyOn(AuthModel.api, "post")
      .mockImplementation(
        (() => new Promise((resolve) => (finish = () => resolve({ success: true })))) as never,
      );
    const ended = watchEnds();

    const revoke = AuthModel.revokeSession(getSessionEpoch("MAIN"));
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    const logout = AuthModel.logout();
    finish();

    await expect(revoke).resolves.toBe(true);
    await expect(logout).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("a voluntary logout ends as logout without a return path", async () => {
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const ended = watchEnds();

    await AuthModel.logout();

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(hasSessionHint()).toBe(false);
    expect(navigateTo).not.toHaveBeenCalled(); // the layout navigates to plain /login
  });
});
