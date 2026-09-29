import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { AuthModel } from "@/services/auth/auth";
import {
  clearAuthTokens,
  clearServiceTokens,
  endSession,
  getAccessToken,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * The auth store relies on auto-imported `defineStore` / `ref` / `computed`
 * (unplugin-auto-import is not part of the vitest config), so they are provided
 * as globals before the store module is loaded.
 */
let useAuthStore: typeof import("@/stores/auth").useAuthStore;
let queryClient: typeof import("@/plugins/vue-query").queryClient;
let setupSessionExpiry: typeof import("@/plugins/session-expiry").setupSessionExpiry;

describe("auth store", () => {
  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ useAuthStore } = await import("@/stores/auth"));
    ({ queryClient } = await import("@/plugins/vue-query"));
    ({ setupSessionExpiry } = await import("@/plugins/session-expiry"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => vi.restoreAllMocks());

  it("hydrate keeps the tokens on a network error (no logout)", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const logout = vi.spyOn(AuthModel, "logout");
    const store = useAuthStore();

    await store.hydrate();

    expect(getAccessToken("MAIN")).toBe("AT");
    expect(store.isAuthenticated).toBe(true);
    expect(logout).not.toHaveBeenCalled();
  });

  it("hydrate keeps the tokens on a 5xx", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 503, message: "down" });
    const store = useAuthStore();

    await store.hydrate();

    expect(getAccessToken("MAIN")).toBe("AT");
  });

  it("hydrate surfaces a transient failure as a retryable error, and retry recovers", async () => {
    const store = useAuthStore();

    const me = { _id: "u1", email: "a@b.com", name: "A", role: "user" };
    const getMe = vi
      .spyOn(AuthModel, "getMe")
      .mockRejectedValueOnce({ error_code: 0, message: "Network Error" })
      .mockResolvedValueOnce(me as never);

    await store.hydrate();
    expect(store.hydrateError).toMatchObject({ error_code: 0, retryable: true });
    expect(store.isAuthenticated).toBe(true);

    await store.retryHydrate();
    expect(store.hydrateError).toBeNull();
    expect(store.user).toEqual(me);
    expect(getMe).toHaveBeenCalledTimes(2);
  });

  it("a 401 on hydrate is a normal logged-out flow: no retry banner state", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 401, message: "expired" });
    vi.spyOn(AuthModel, "revokeSession").mockResolvedValue(undefined as never);
    const store = useAuthStore();

    await store.hydrate();

    expect(store.hydrateError).toBeNull();
    expect(store.user).toBeNull();
  });

  it("a late hydrate success after logout does not resurrect the user", async () => {
    let resolveMe!: (user: never) => void;
    vi.spyOn(AuthModel, "getMe").mockReturnValue(new Promise((r) => (resolveMe = r)));
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    const store = useAuthStore();

    const pending = store.hydrate();
    await AuthModel.logout();
    resolveMe({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);
    await pending;

    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it("retryHydrate shares one in-flight run and flags retrying", async () => {
    const store = useAuthStore();

    let resolveMe!: (user: never) => void;
    const getMe = vi.spyOn(AuthModel, "getMe").mockReturnValue(new Promise((r) => (resolveMe = r)));

    const first = store.retryHydrate();
    const second = store.retryHydrate();
    expect(store.retrying).toBe(true);

    resolveMe({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);
    await Promise.all([first, second]);

    expect(getMe).toHaveBeenCalledTimes(1);
    expect(store.retrying).toBe(false);
  });

  it("isAuthenticated reacts to token writes and clears (localStorage is not reactive)", () => {
    const store = useAuthStore();
    expect(store.isAuthenticated).toBe(true);

    clearAuthTokens();
    expect(store.isAuthenticated).toBe(false);

    persistAccessToken("AT2", "MAIN");
    expect(store.isAuthenticated).toBe(true);
  });

  it("logout sends the refresh token in the body and clears tokens + query cache", async () => {
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    queryClient.setQueryData(["users.list"], ["someone"]);
    const store = useAuthStore();

    await AuthModel.logout();

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/auth/logout", data: { refreshToken: "RT" } }),
    );
    expect(getAccessToken("MAIN")).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(store.isAuthenticated).toBe(false);
  });

  it("voluntary logout never announces session expiry, even when the request fails", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);
    onTestFinished(unsubscribe);
    queryClient.setQueryData(["users.list"], ["someone"]);
    const store = useAuthStore();
    store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);

    await AuthModel.logout().catch(() => {});

    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    expect(store.user).toBeNull();
    expect(getAccessToken("MAIN")).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
  });

  it("session expiry clears the session + cache and routes to /login with a redirect", () => {
    const activePinia = pinia.createPinia();
    pinia.setActivePinia(activePinia);
    const replace = vi.fn().mockResolvedValue(undefined);
    const router = {
      currentRoute: { value: { name: "users", fullPath: "/users?page=2", meta: {} } },
      replace,
    } as unknown as Parameters<typeof setupSessionExpiry>[0];
    setupSessionExpiry(router, activePinia);
    queryClient.setQueryData(["users.list"], ["someone"]);

    // The refresh manager clears the refused service's tokens, then ends the session.
    clearServiceTokens("MAIN");
    endSession("expired", "MAIN");

    expect(useAuthStore(activePinia).isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(replace).toHaveBeenCalledWith("/login?redirect=%2Fusers%3Fpage%3D2");
  });
});
