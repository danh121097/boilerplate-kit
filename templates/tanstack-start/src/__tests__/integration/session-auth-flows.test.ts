import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { AuthModel } from "@/services/auth";
import {
  Api,
  hasSessionHint,
  markSessionActive,
  onSessionEnded,
  redirectOnSessionExpired,
} from "@/services/core";
import {
  makeQueryClient,
  resetQueriesOnSessionEnd,
  resyncQueriesAfterLogin,
} from "@/services/core/query-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Regression tests for the session rules: an anonymous or credential 401 never
 * refreshes or reloads, a failed refresh ends the session instead of reloading,
 * and logout always clears the session + query cache.
 */

const CREDENTIAL_PATHS = ["/auth/login", "/auth/register", "/auth/logout"];

/** What the bare refresh client's `axios.post` rejects with. */
function refreshError(failure: { status?: number; code?: string }) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    code: failure.code,
    response: failure.status ? { status: failure.status, data: {} } : undefined,
  });
}

function setup(hasSession: boolean | (() => boolean)) {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  const post = vi.spyOn(axios, "post");
  const client = (adapter: Parameters<typeof makeClient>[0]) =>
    makeClient(adapter, {
      MAIN: {
        endpoint: "/auth/refresh",
        skipPaths: CREDENTIAL_PATHS,
        hasSession: typeof hasSession === "function" ? hasSession : () => hasSession,
      },
    });
  return { reload, post, client };
}

describe("session auth flows", () => {
  beforeEach(() => {
    Api.setBaseURL("http://api.test", "MAIN");
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("refresh failure ends the session without reloading and rejects with the original 401", async () => {
    const { post, reload, client } = setup(true);
    post.mockRejectedValue(refreshError({ status: 401 }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(reload).not.toHaveBeenCalled();
    off();
  });

  it.each([
    ["network error", { code: "ERR_NETWORK" }],
    ["timeout", { code: "ECONNABORTED" }],
    ["503", { status: 503 }],
    ["429", { status: 429 }],
  ])(
    "transient refresh failure (%s) keeps the hint, no session end, rejects retryable",
    async (_label, failure) => {
      markSessionActive();
      const { post, reload, client } = setup(hasSessionHint);
      post.mockRejectedValue(refreshError(failure));
      const ended = vi.fn();
      const off = onSessionEnded(ended);

      const http = client(async (config) => httpError(config, 401));

      const error = await http.get("/users").catch((e: unknown) => e);
      expect(error).toMatchObject({ retryable: true });
      expect((error as { error_code: number }).error_code).not.toBe(401);
      expect(ended).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(hasSessionHint()).toBe(true);
      off();
    },
  );

  it("the refresh request gives up after 15s so a hung refresh cannot stall requests", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockResolvedValue({ data: {} });
    const http = client(async (config) =>
      config._retry ? ok(config, { status: "success", data: 1 }) : httpError(config, 401),
    );

    await http.get("/users");

    expect(post.mock.calls[0]![2]).toMatchObject({ timeout: 15_000 });
  });

  it("refused refresh (403) ends the session and clears the hint", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 403 }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(hasSessionHint()).toBe(false);
    off();
  });

  it("redirects to /login when a hinted session's refresh is refused", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 401 }));
    const redirect = vi.fn();
    const off = redirectOnSessionExpired(redirect);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(redirect).toHaveBeenCalledTimes(1);
    off();
  });

  it("never redirects an anonymous visitor (no hint) or on a transient failure", async () => {
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 503 }));
    const redirect = vi.fn();
    const off = redirectOnSessionExpired(redirect);
    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/auth/me")).rejects.toMatchObject({ error_code: 401 }); // anonymous
    expect(post).not.toHaveBeenCalled();

    markSessionActive();
    await expect(http.get("/users")).rejects.toMatchObject({ retryable: true }); // transient
    expect(redirect).not.toHaveBeenCalled();

    await AuthModel.logout().catch(() => {}); // logout is not a redirect trigger
    expect(redirect).not.toHaveBeenCalled();
    off();
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

    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    expect(hasSessionHint()).toBe(false);
    off();
  });

  it("session end drops unobserved queries and pins auth.me to null", async () => {
    const queryClient = makeQueryClient();
    queryClient.setQueryData(["users.list"], { data: [{ _id: "1" }] });
    queryClient.setQueryData(["auth.me"], { _id: "1" });
    const off = resetQueriesOnSessionEnd(queryClient, "auth.me");

    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    await AuthModel.logout();

    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(document.cookie).toContain(`${STORAGE_KEYS.SESSION}=;`);
    off();
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
