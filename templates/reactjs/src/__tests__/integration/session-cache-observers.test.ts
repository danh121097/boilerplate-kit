import { STORAGE_KEYS } from "@/enums";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { endSession, persistAccessToken } from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

/**
 * What mounted components (the header reading `auth.me`, a page listing users)
 * see when the session ends and starts again. They hold QueryObservers; the
 * cache must be reset under them, not swapped out from under them.
 */

// The auth store reads localStorage at import time.
vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
});

const ME = queryKeys.auth.me;
const USERS = "users.list";

/** A signed-in page: the header's `auth.me` observer and a users-list observer. */
function mountSignedInPage(fetchMe: () => Promise<unknown>) {
  const fetchUsers = vi.fn(async () => [{ _id: "1" }]);
  queryClient.setQueryData([ME], { _id: "u1" });
  queryClient.setQueryData([USERS], [{ _id: "1" }]);
  const options = { staleTime: 60_000 };
  const header = new QueryObserver(queryClient, { ...options, queryKey: [ME], queryFn: fetchMe });
  const list = new QueryObserver(queryClient, {
    ...options,
    queryKey: [USERS],
    queryFn: fetchUsers,
  });
  const unsubscribe = [header.subscribe(() => {}), list.subscribe(() => {})];
  return { header, list, fetchUsers, unmount: () => unsubscribe.forEach((off) => off()) };
}

/** What the login mutation does on success: invalidate `auth.me`. */
async function loginInThisTab() {
  await queryClient.invalidateQueries({ queryKey: [ME] });
}

describe("mounted observers across session end and login", () => {
  beforeEach(() => queryClient.clear());

  // Runs after each test's own onTestFinished cleanups, which unsubscribe
  // from the stubbed globals.
  beforeEach(({ onTestFinished }) => {
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it("a logout in another tab shows signed-out data to mounted observers without refetching", () => {
    let onStorage!: (event: { key: string | null }) => void;
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => {
        onStorage = fn;
      },
      removeEventListener: vi.fn(),
    });
    persistAccessToken("AT", "MAIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const stop = syncAuthWithOtherTabs(vi.fn());
    onTestFinished(stop);
    const fetchMe = vi.fn(async () => ({ _id: "u1" }));
    const page = mountSignedInPage(fetchMe);
    onTestFinished(page.unmount);

    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(page.header.getCurrentResult().data).toBeNull();
    expect(page.list.getCurrentResult().data).toBeUndefined();
    expect(fetchMe).not.toHaveBeenCalled();
    expect(page.fetchUsers).not.toHaveBeenCalled();
  });

  it("logout then login again in the same tab shows the new user to the mounted header", async () => {
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(fetchMe);
    onTestFinished(page.unmount);

    endSession("logout");
    expect(page.header.getCurrentResult().data).toBeNull();
    await loginInThisTab();

    expect(fetchMe).toHaveBeenCalledTimes(1);
    expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" });
  });

  it("session expiry then login shows the new user to the mounted header", async () => {
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(fetchMe);
    onTestFinished(page.unmount);

    endSession("expired");
    expect(page.header.getCurrentResult().data).toBeNull();
    expect(page.list.getCurrentResult().data).toBeUndefined();
    await loginInThisTab();

    expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" });
  });

  it("a login in another tab refetches the mounted header's user", async () => {
    let onStorage!: (event: { key: string | null }) => void;
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => {
        onStorage = fn;
      },
      removeEventListener: vi.fn(),
    });
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u2" } as never);
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(fetchMe);
    onTestFinished(page.unmount);
    endSession("logout");
    const stop = syncAuthWithOtherTabs(vi.fn());
    onTestFinished(stop);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    await vi.waitFor(() => expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" }));
  });

  it("session end drops unobserved queries and keeps auth.me pinned to null", () => {
    queryClient.setQueryData(["users.detail", "1"], { _id: "1" });

    endSession("logout");

    expect(queryClient.getQueryCache().find({ queryKey: ["users.detail", "1"] })).toBeUndefined();
    expect(queryClient.getQueryData([ME])).toBeNull();
  });
});
