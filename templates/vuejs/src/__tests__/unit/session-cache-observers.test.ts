import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth/auth";
import { persistAccessToken, persistRefreshToken } from "@/services/core";
import { QueryObserver } from "@tanstack/vue-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import * as pinia from "pinia";
import * as vue from "vue";

/**
 * What mounted views (a page listing users, anything reading `auth.me`) see
 * when the session ends and starts again. They hold QueryObservers; the cache
 * must be reset under them, not swapped out from under them. The store relies
 * on auto-imported `defineStore` / `ref` / `computed`, provided as globals.
 */

let useAuthStore: typeof import("@/stores/auth").useAuthStore;
let queryClient: typeof import("@/plugins/vue-query").queryClient;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A signed-in `/users` view: a mounted users-list observer. */
function mountUsersView(fetchUsers: () => Promise<unknown>) {
  const list = new QueryObserver(queryClient, {
    queryKey: ["users.list"],
    queryFn: fetchUsers,
    staleTime: 60_000,
  });
  const unsubscribe = list.subscribe(() => {});
  return { list, unmount: unsubscribe };
}

describe("mounted observers across session end and login", () => {
  const target = new EventTarget();

  const otherTabWroteStorage = () => target.dispatchEvent(new Event("storage"));

  beforeAll(async () => {
    vi.stubGlobal("defineStore", pinia.defineStore);
    vi.stubGlobal("ref", vue.ref);
    vi.stubGlobal("computed", vue.computed);
    ({ useAuthStore } = await import("@/stores/auth"));
    ({ queryClient } = await import("@/plugins/vue-query"));
  });

  beforeEach(() => {
    Object.assign(globalThis, { window: target });
    installLocalStorage();
    pinia.setActivePinia(pinia.createPinia());
    queryClient.clear();
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { window?: unknown }).window;
  });

  it("another tab's logout drops the mounted users view's data without refetching", async () => {
    useAuthStore().setUser({ _id: "u1" } as never);
    const fetchUsers = vi.fn(async () => [{ _id: "previous-user-row" }]);
    const view = mountUsersView(fetchUsers);
    onTestFinished(view.unmount);
    await flush();
    expect(view.list.getCurrentResult().data).toEqual([{ _id: "previous-user-row" }]);

    localStorage.clear(); // the other tab logged out
    otherTabWroteStorage();

    expect(view.list.getCurrentResult().data).toBeUndefined();
    expect(fetchUsers).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
  });

  it("another tab's logout then login refetches the mounted users view", async () => {
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u2" } as never);
    const store = useAuthStore();
    store.setUser({ _id: "u1" } as never);
    let rows: unknown = [{ _id: "u1-row" }];
    const fetchUsers = vi.fn(async () => rows);
    const view = mountUsersView(fetchUsers);
    onTestFinished(view.unmount);
    await flush();

    localStorage.clear(); // the other tab logged out
    otherTabWroteStorage();
    expect(view.list.getCurrentResult().data).toBeUndefined();

    rows = [{ _id: "u2-row" }];
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT2"); // the other tab logged in
    otherTabWroteStorage();

    await vi.waitFor(() => expect(view.list.getCurrentResult().data).toEqual([{ _id: "u2-row" }]));
    expect(fetchUsers).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(store.user).toEqual({ _id: "u2" }));
  });

  it("logout then login in the same tab refetches the mounted view", async () => {
    vi.spyOn(AuthModel, "logout").mockResolvedValue();
    const store = useAuthStore();
    let rows: unknown = [{ _id: "u1-row" }];
    const fetchUsers = vi.fn(async () => rows);
    const view = mountUsersView(fetchUsers);
    onTestFinished(view.unmount);
    await flush();

    await AuthModel.logout();
    store.clearSession();
    expect(view.list.getCurrentResult().data).toBeUndefined();

    rows = [{ _id: "u2-row" }]; // login succeeds → the mutation invalidates the list
    await queryClient.invalidateQueries({ queryKey: ["users.list"] });

    expect(fetchUsers).toHaveBeenCalledTimes(2);
    expect(view.list.getCurrentResult().data).toEqual([{ _id: "u2-row" }]);
  });

  it("session end removes unobserved queries and pins auth.me to null", () => {
    queryClient.setQueryData(["users.detail", "1"], { _id: "1" });

    useAuthStore().clearSession();

    expect(queryClient.getQueryCache().find({ queryKey: ["users.detail", "1"] })).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
  });
});
