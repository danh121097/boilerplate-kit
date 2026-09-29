import { httpError, ok } from "@/__tests__/helpers/http-mocks";
import { setupRefreshClient as setup } from "@/__tests__/helpers/session-browser";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import { Api, hasSessionHint, markSessionActive, onSessionEnded } from "@/services/core";
import {
  makeQueryClient,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
} from "@/services/core/query-client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

/**
 * Regression tests for the session rules: an anonymous or credential 401 never
 * refreshes or reloads, a successful refresh replays the request, and logout
 * always clears the session + query cache.
 */

describe("session auth flows", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
    vi.stubGlobal("document", { cookie: "" });
  });

  // Runs after each test's own onTestFinished cleanups, which unsubscribe
  // from the stubbed globals.
  beforeEach(({ onTestFinished }) => {
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it("anonymous 401 on /auth/me: no refresh, no reload, rejects with error_code 401", async () => {
    let calls = 0;

    const { post, reload, client } = setup(false);

    const http = client(async (config) => {
      calls += 1;
      return httpError(config, 401, { success: false, message: "Access token required!" });
    });

    await expect(http.get("/auth/me")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  it("getSession resolves an anonymous 401 to null (signed out), not an error", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({ error_code: 401, message: "no" });
    await expect(AuthModel.getSession()).resolves.toBeNull();
  });

  it("getSession rethrows non-auth failures so they are not cached as signed out", async () => {
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({ error_code: 503, message: "down" });
    await expect(AuthModel.getSession()).rejects.toMatchObject({ error_code: 503 });
  });

  it("login 401 (wrong password) surfaces the error: no refresh, no reload", async () => {
    const { post, reload, client } = setup(true); // even with a live session hint

    const http = client(async (config) =>
      httpError(config, 401, { success: false, error_code: 401, message: "Invalid credentials" }),
    );

    await expect(http.post("/auth/login", { email: "a", password: "b" })).rejects.toMatchObject({
      message: "Invalid credentials",
    });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it("a successful refresh replays the request", async () => {
    const { post, client } = setup(true);
    post.mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const http = client(async (config) => {
      calls += 1;
      return calls === 1 ? httpError(config) : ok(config, { success: true, data: [1] });
    });

    await expect(http.get("/users")).resolves.toMatchObject({ data: [1] });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("logout ends the session (hint cleared) even when the request fails", async () => {
    markSessionActive();
    expect(hasSessionHint()).toBe(true);
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(hasSessionHint()).toBe(false);
  });

  it("session end drops unobserved queries and pins auth.me to null", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(["users.list"], { data: [{ _id: "1" }] });
    queryClient.setQueryData(["auth.me"], { _id: "1" });
    const off = resetQueriesOnSessionEnd(queryClient, "auth.me");
    onTestFinished(off);

    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();

    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(document.cookie).toContain(`${STORAGE_KEYS.SESSION}=;`);
  });

  it("a login in another tab drops the cached signed-out user and marks every query stale", () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(["auth.me"], null);
    queryClient.setQueryData(["users.list"], []);

    resyncQueriesAfterLogin(queryClient, "auth.me");

    expect(queryClient.getQueryData(["auth.me"])).toBeUndefined();
    expect(queryClient.getQueryState(["users.list"])?.isInvalidated).toBe(true);
  });
});
