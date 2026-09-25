import { markSessionActive } from "@/services/core";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The client plugin that follows logins / logouts made in other tabs by
 * re-reading the session-hint cookie on focus and visibility. `window`,
 * `document` and `defineNuxtPlugin` are stubbed.
 */

type PluginFn = (nuxtApp: unknown) => void;

describe("05.session-sync.client plugin", () => {
  const queryClient = new QueryClient();
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { cookie: "", visibilityState: "visible" });
  const HINT = "PRISM_APP_SESSION=1";

  const focus = () => win.dispatchEvent(new Event("focus"));

  beforeAll(async () => {
    vi.stubGlobal("defineNuxtPlugin", (fn: PluginFn) => fn);
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", doc);
    doc.cookie = HINT; // this tab boots signed in
    const plugin = (await import("@/plugins/05.session-sync.client"))
      .default as unknown as PluginFn;
    plugin({ $queryClient: queryClient });
  });

  beforeEach(() => {
    queryClient.clear();
    doc.cookie = HINT;
    focus(); // settle on "signed in"
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(() => vi.unstubAllGlobals());

  it("another tab's logout clears the cached user and every query on focus", () => {
    queryClient.setQueryData(["auth.me"], { _id: "u1" });
    queryClient.setQueryData(["users.list"], { data: [1] });

    doc.cookie = ""; // the other tab dropped the hint
    focus();

    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
  });

  it("another tab's login forgets the signed-out user and marks every query stale (on visibility)", () => {
    doc.cookie = "";
    focus(); // this tab is now signed out
    queryClient.setQueryData(["auth.me"], null);
    queryClient.setQueryData(["users.list"], { data: ["stale"] });

    doc.cookie = HINT; // the other tab logged in
    doc.dispatchEvent(new Event("visibilitychange"));

    expect(queryClient.getQueryData(["auth.me"])).toBeUndefined();
    const list = queryClient.getQueryCache().find({ queryKey: ["users.list"] });
    expect(list?.state.isInvalidated).toBe(true);
  });

  it("this tab's own login is not mistaken for another tab's", () => {
    doc.cookie = "";
    focus();
    const reset = vi.spyOn(queryClient, "resetQueries");

    markSessionActive(); // writes the hint the way login does
    doc.cookie = HINT; // (the stub does not persist cookie writes)
    focus();

    expect(reset).not.toHaveBeenCalled();
  });

  it("does nothing while the hint is unchanged", () => {
    queryClient.setQueryData(["users.list"], { data: [1] });
    focus();
    expect(queryClient.getQueryData(["users.list"])).toEqual({ data: [1] });
  });

  it("another tab's logout then login refetches the profile for the mounted header", async () => {
    let user: unknown = { _id: "u1" };
    const fetchMe = vi.fn(async () => user);
    const header = new QueryObserver(queryClient, {
      queryKey: ["auth.me"],
      queryFn: fetchMe,
      staleTime: Infinity,
    });
    const unsubscribe = header.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));

    doc.cookie = ""; // the other tab logged out
    focus();
    expect(header.getCurrentResult().data).toBeNull();

    user = { _id: "u2" };
    doc.cookie = HINT; // the other tab logged in
    focus();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMe).toHaveBeenCalledTimes(2);
    expect(header.getCurrentResult().data).toEqual({ _id: "u2" });
    unsubscribe();
  });
});
