import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { AuthModel } from "@/services/auth/auth";
import {
  getAccessToken,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * The logout control (App.vue): `useLogoutMutation` with `onSettled` clearing the
 * session locally and routing to /login. Settled, not success — a failed server
 * call still signs the client out.
 */
let useLogoutMutation: typeof import("@/services/auth").useLogoutMutation;
let useAuthStore: typeof import("@/stores/auth").useAuthStore;
let queryClient: typeof import("@/plugins/vue-query").queryClient;

/** Run `useLogoutMutation` the way App.vue does, wired to the store and a router stub. */
function mountLogout() {
  const push = vi.fn().mockResolvedValue(undefined);
  const app = vue.createApp({});
  app.use(VueQueryPlugin, { queryClient });
  const scope = vue.effectScope();
  const store = useAuthStore();
  const mutation = app.runWithContext(() =>
    scope.run(() =>
      useLogoutMutation({
        onSettled: async () => {
          await push({ name: "login" });
        },
      }),
    ),
  )!;
  return { mutation, push, store, stop: () => scope.stop() };
}

describe("logout mutation", () => {
  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ useLogoutMutation } = await import("@/services/auth"));
    ({ useAuthStore } = await import("@/stores/auth"));
    ({ queryClient } = await import("@/plugins/vue-query"));
  });

  beforeEach(() => {
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    queryClient.clear();
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => vi.restoreAllMocks());

  it("is pending while the request runs, then signs out once and routes to /login", async () => {
    let finish!: () => void;
    vi.spyOn(AuthModel.api, "post").mockReturnValue(
      new Promise((r) => (finish = () => r({ success: true } as never))),
    );
    const ended = vi.fn();
    onTestFinished(onSessionEnded(ended));
    const { mutation, push, store, stop } = mountLogout();
    store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);

    mutation.mutate();
    await vi.waitFor(() => expect(mutation.isPending.value).toBe(true));
    expect(push).not.toHaveBeenCalled();

    finish();
    await vi.waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith({ name: "login" }));
    expect(mutation.isPending.value).toBe(false);
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(getAccessToken("MAIN")).toBeNull();
    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    stop();
  });

  it("still signs out and routes to /login when the request fails", async () => {
    vi.spyOn(AuthModel.api, "post").mockRejectedValue({ error_code: 0, message: "Network Error" });
    const ended = vi.fn();
    onTestFinished(onSessionEnded(ended));
    const { mutation, push, store, stop } = mountLogout();
    store.setUser({ _id: "u1", email: "a@b.com", name: "A", role: "user" } as never);

    mutation.mutate();

    await vi.waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith({ name: "login" }));
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
    expect(getAccessToken("MAIN")).toBeNull();
    expect(ended).toHaveBeenCalledExactlyOnceWith("logout", "MAIN");
    stop();
  });
});
