import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, makeClient } from "@/__tests__/helpers/http-mocks";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { Api } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Regression tests for the session rules: an anonymous or credential 401 never
 * refreshes or reloads, a boot network error or unavailable refresh keeps the
 * tokens, and logout revokes the refresh token and clears the query cache.
 * Refresh outcomes live in session-refresh-outcomes.test.ts.
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

const REFRESH = {
  MAIN: {
    endpoint: "/auth/refresh",
    skipPaths: ["/auth/login", "/auth/register", "/auth/logout"],
  },
};

function setup() {
  const reload = vi.fn();
  vi.stubGlobal("window", { location: { reload } });
  const post = vi.spyOn(axios, "post");
  const client = (adapter: Parameters<typeof makeClient>[0]) => makeClient(adapter, REFRESH);
  return { reload, post, client };
}

describe("session auth flows", () => {
  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("anonymous 401: no refresh, no reload, rejects with error_code 401", async () => {
    let calls = 0;

    const { post, reload, client } = setup();

    const http = client(async (config) => {
      calls += 1;
      return httpError(config, 401, { success: false, message: "Access token required!" });
    });

    await expect(http.get("/auth/me")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  it("login 401 (wrong password) surfaces the error and keeps tokens: no refresh, no reload", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    const { post, reload, client } = setup();

    const http = client(async (config) =>
      httpError(config, 401, { success: false, error_code: 401, message: "Invalid credentials" }),
    );

    await expect(http.post("/auth/login", { email: "a", password: "b" })).rejects.toMatchObject({
      message: "Invalid credentials",
    });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe("RT");
  });

  it("boot: a transient refresh failure during hydrate keeps the session", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    // What the interceptor rejects /auth/me with when the refresh is unavailable.
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({
      status: "error",
      error_code: 0,
      message: "refresh_unavailable",
      error_message: "refresh_unavailable",
      retryable: true,
    });
    const logout = vi.spyOn(AuthModel, "logout");

    await useAuthStore.getState().hydrate();

    expect(logout).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe("RT");
    expect(useAuthStore.getState()).toMatchObject({ hydrated: true, isAuthenticated: true });
  });

  it("boot: a network error / 5xx keeps the tokens and the session", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({ message: "Network Error" });
    const logout = vi.spyOn(AuthModel, "logout");

    await useAuthStore.getState().hydrate();

    expect(logout).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("AT");
    expect(getRefreshToken()).toBe("RT");
    expect(useAuthStore.getState()).toMatchObject({ hydrated: true, isAuthenticated: true });
  });

  it("logout sends the refresh token in the body, the access token as Bearer, and clears tokens + query cache", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    useAuthStore.setState({ user: { _id: "u1" } as never, isAuthenticated: true });
    queryClient.setQueryData(["users.list"], { data: [{ _id: "1" }] });
    const post = vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    await useAuthStore.getState().logout();

    expect(post).toHaveBeenCalledWith({
      url: "/auth/logout",
      data: { refreshToken: "RT" },
      customHeaders: { authorization: "Bearer AT" },
    });
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it("logout still clears the session when the request fails", async () => {
    persistRefreshToken("RT");
    queryClient.setQueryData(["users.list"], { data: [] });
    vi.spyOn(AuthModel.api, "post").mockRejectedValue(new Error("network"));

    await expect(AuthModel.logout()).rejects.toThrow("network");
    expect(getRefreshToken()).toBeNull();
    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
  });
});
