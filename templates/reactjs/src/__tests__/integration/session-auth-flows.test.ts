import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { Api, clearServiceTokens, endSession, onSessionEnded } from "@/services/core";
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
 * refreshes or reloads, a failed refresh ends the session instead of reloading,
 * a boot network error keeps the tokens, and logout revokes the refresh token
 * and clears the query cache.
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

/** What the bare refresh client's `axios.post` rejects with. */
function refreshError(failure: { status?: number; code?: string }) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    code: failure.code,
    response: failure.status ? { status: failure.status, data: {} } : undefined,
  });
}

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

  it("refresh failure ends the session without reloading and rejects with the original 401", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, reload, client } = setup();
    post.mockRejectedValue(refreshError({ status: 401 }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(reload).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    off();
  });

  it.each([
    ["network error", { code: "ERR_NETWORK" }],
    ["timeout", { code: "ECONNABORTED" }],
    ["503", { status: 503 }],
    ["429", { status: 429 }],
    ["400", { status: 400 }],
  ])(
    "transient refresh failure (%s) keeps tokens, no session end, rejects retryable",
    async (_label, failure) => {
      persistAccessToken("OLD");
      persistRefreshToken("RT");
      const { post, reload, client } = setup();
      post.mockRejectedValue(refreshError(failure));
      const ended = vi.fn();
      const off = onSessionEnded(ended);

      const http = client(async (config) => httpError(config, 401));

      const error = await http.get("/users").catch((e: unknown) => e);
      expect(error).toMatchObject({ retryable: true, message: "refresh_unavailable" });
      expect((error as { error_code: number }).error_code).not.toBe(401);
      expect(ended).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe("OLD");
      expect(getRefreshToken()).toBe("RT");
      off();
    },
  );

  it("a refresh answering 200 without an access token keeps the session and rejects retryable", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: {} } });
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 0, retryable: true });
    expect(ended).not.toHaveBeenCalled();
    expect(getRefreshToken()).toBe("RT");
    off();
  });

  it("the refresh request gives up after 15s so a hung refresh cannot stall requests", async () => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: { tokens: { accessToken: "NEW" } } } });
    const http = client(async (config) =>
      config._retry ? ok(config, { status: "success", data: 1 }) : httpError(config, 401),
    );

    await http.get("/users");

    expect(post.mock.calls[0]![2]).toMatchObject({ timeout: 15_000 });
  });

  it.each([
    [503, true],
    [429, true],
    [404, false],
  ])(
    "a failed request (%i) carries its status as error_code, retryable=%s",
    async (status, retryable) => {
      const { client } = setup();

      const http = client(async (config) => httpError(config, status));

      const error = (await http.get("/users").catch((e: unknown) => e)) as Record<string, unknown>;

      expect(error.error_code).toBe(status);
      expect(Boolean(error.retryable)).toBe(retryable);
    },
  );

  it.each([401, 403])("refused refresh (%i) ends the session and clears tokens", async (status) => {
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockRejectedValue(refreshError({ status }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(getRefreshToken()).toBeNull();
    off();
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

  it("refreshes with only a refresh token stored (expired access token was cleared)", async () => {
    persistRefreshToken("RT");
    const { post, client } = setup();
    post.mockResolvedValue({ data: { data: { tokens: { accessToken: "NEW" } } } } as never);
    let calls = 0;
    const http = client(async (config) => {
      calls += 1;
      return calls === 1 ? httpError(config) : ok(config, { success: true, data: [1] });
    });

    await expect(http.get("/users")).resolves.toMatchObject({ data: [1] });
    expect(getAccessToken()).toBe("NEW");
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

  it("boot 401 after a refused refresh does not post logout again", async () => {
    persistAccessToken("AT");
    persistRefreshToken("RT");
    // What the interceptor does when the refresh is refused, then the 401 it rejects with.
    vi.spyOn(AuthModel.api, "get").mockImplementation(async () => {
      clearServiceTokens("MAIN");
      endSession("expired", "MAIN");
      throw { status: "error", error_code: 401, message: "expired" };
    });
    const post = vi.spyOn(AuthModel.api, "post");
    const ended = vi.fn();
    const off = onSessionEnded(ended);

    await useAuthStore.getState().hydrate();

    expect(post).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      hydrated: true,
    });
    off();
  });

  it("boot: a 401 while the session is still stored revokes it and logs out", async () => {
    persistAccessToken("AT");
    vi.spyOn(AuthModel.api, "get").mockRejectedValue({ error_code: 401, message: "no" });
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);

    await useAuthStore.getState().hydrate();

    expect(getAccessToken()).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
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
