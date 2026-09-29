import { STORAGE_KEYS } from "@/enums";
import {
  makeQueryClient,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
} from "@/services/core/query-client";
import { endSession, markSessionActive, syncAuthAcrossTabs } from "@/services/core/session";
import { QueryObserver } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";

/**
 * What mounted components (the header reading `auth.me`, a page listing users)
 * see when the session ends and starts again. They hold QueryObservers; the
 * cache must be reset under them, not swapped out from under them.
 */

const ME = "auth.me";
const USERS = "users.list";

/** Browser globals with capturable `storage` / `visibilitychange` listeners. */
function installBrowser() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const listen = (type: string, fn: (event: unknown) => void) => {
    handlers[type] = fn;
  };
  vi.stubGlobal("window", { addEventListener: listen, removeEventListener: vi.fn() });
  vi.stubGlobal("document", {
    cookie: "",
    visibilityState: "visible",
    addEventListener: listen,
    removeEventListener: vi.fn(),
  });
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return handlers;
}

/** A signed-in page: the header's `auth.me` observer and a users-list observer. */
function mountSignedInPage(queryClient: QueryClient, fetchMe: () => Promise<unknown>) {
  const fetchUsers = vi.fn(async () => [{ _id: "1" }]);
  queryClient.setQueryData([ME], { _id: "u1" });
  queryClient.setQueryData([USERS], [{ _id: "1" }]);
  const header = new QueryObserver(queryClient, { queryKey: [ME], queryFn: fetchMe });
  const list = new QueryObserver(queryClient, { queryKey: [USERS], queryFn: fetchUsers });
  const unsubscribe = [header.subscribe(() => {}), list.subscribe(() => {})];
  return { header, list, fetchUsers, unmount: () => unsubscribe.forEach((off) => off()) };
}

/** What the login mutation does on success: invalidate `auth.me`. */
async function loginInThisTab(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: [ME] });
}

describe("mounted observers across session end and login", () => {
  // Runs after each test's own onTestFinished cleanups, which unsubscribe
  // from the stubbed globals.
  beforeEach(({ onTestFinished }) => {
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it("a logout in another tab shows signed-out data to mounted observers without refetching", () => {
    const handlers = installBrowser();
    markSessionActive();
    const queryClient = makeQueryClient();
    const off = resetQueriesOnSessionEnd(queryClient, ME);
    onTestFinished(off);
    const stop = syncAuthAcrossTabs();
    onTestFinished(stop);
    const fetchMe = vi.fn(async () => ({ _id: "u1" }));
    const page = mountSignedInPage(queryClient, fetchMe);
    onTestFinished(page.unmount);

    document.cookie = `${STORAGE_KEYS.SESSION}=; path=/; max-age=0`; // other tab cleared it
    handlers.storage!({ key: STORAGE_KEYS.AUTH_SYNC, newValue: "logout:1" });

    expect(page.header.getCurrentResult().data).toBeNull();
    expect(page.list.getCurrentResult().data).toBeUndefined();
    expect(fetchMe).not.toHaveBeenCalled();
    expect(page.fetchUsers).not.toHaveBeenCalled();
  });

  it("logout then login again in the same tab shows the new user to the mounted header", async () => {
    installBrowser();
    const queryClient = makeQueryClient();
    const off = resetQueriesOnSessionEnd(queryClient, ME);
    onTestFinished(off);
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(queryClient, fetchMe);
    onTestFinished(page.unmount);

    endSession("logout");
    expect(page.header.getCurrentResult().data).toBeNull();
    await loginInThisTab(queryClient);

    expect(fetchMe).toHaveBeenCalledTimes(1);
    expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" });
  });

  it("session expiry then login shows the new user to the mounted header", async () => {
    installBrowser();
    const queryClient = makeQueryClient();
    const off = resetQueriesOnSessionEnd(queryClient, ME);
    onTestFinished(off);
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(queryClient, fetchMe);
    onTestFinished(page.unmount);

    endSession("expired");
    expect(page.header.getCurrentResult().data).toBeNull();
    expect(page.list.getCurrentResult().data).toBeUndefined();
    await loginInThisTab(queryClient);

    expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" });
  });

  it("a login in another tab refetches the mounted header's user", async () => {
    installBrowser();
    const queryClient = makeQueryClient();
    const off = resetQueriesOnSessionEnd(queryClient, ME);
    onTestFinished(off);
    const fetchMe = vi.fn(async () => ({ _id: "u2" }));
    const page = mountSignedInPage(queryClient, fetchMe);
    onTestFinished(page.unmount);
    endSession("logout");

    resyncQueriesAfterLogin(queryClient, ME);

    await vi.waitFor(() => expect(page.header.getCurrentResult().data).toEqual({ _id: "u2" }));
  });

  it("session end drops unobserved queries and keeps auth.me pinned to null", () => {
    installBrowser();
    const queryClient = makeQueryClient();
    const off = resetQueriesOnSessionEnd(queryClient, ME);
    onTestFinished(off);
    queryClient.setQueryData(["users.detail", "1"], { _id: "1" });

    endSession("logout");

    expect(queryClient.getQueryCache().find({ queryKey: ["users.detail", "1"] })).toBeUndefined();
    expect(queryClient.getQueryData([ME])).toBeNull();
  });
});
