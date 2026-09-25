import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { installFakeLocks } from "@/__tests__/helpers/fake-web-locks";
import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { APP_PREFIX, STORAGE_KEYS } from "@/enums";
import { queryClient } from "@/providers/query-client-provider";
import { AuthModel } from "@/services/auth";
import { Api, endSession, onSessionEnded, SESSION_WAIT_TIMEOUT_MS } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { queryKeys } from "@/services/query-keys";
import { syncAuthWithOtherTabs, useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Logout vs an in-flight refresh, and cross-tab login/logout sync.
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

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Refresh call held open until `release()`, then answering with a rotated pair. */
function heldRefresh(events: string[]) {
  const gate = deferred();
  vi.spyOn(axios, "post").mockImplementation(async () => {
    await gate.promise;
    events.push("refresh-done");
    return { data: { data: { tokens: { accessToken: "AT2", refreshToken: "RT2" } } } };
  });
  return gate.resolve;
}

describe("logout during an in-flight refresh", () => {
  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
    persistAccessToken("AT1", "MAIN");
    persistRefreshToken("RT1", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for the refresh and revokes the ROTATED token; no tokens are written back", async () => {
    const events: string[] = [];
    const revoked: unknown[] = [];
    const lockRequest = installFakeLocks();
    const release = heldRefresh(events);
    vi.spyOn(AuthModel.api, "post").mockImplementation(async (opts) => {
      events.push("logout");
      revoked.push((opts as { data?: { refreshToken?: string } }).data?.refreshToken);
      return { success: true } as never;
    });

    const http = makeClient(
      async (config) =>
        String(config.headers.authorization).endsWith("AT2")
          ? ok(config, { success: true, data: [] })
          : httpError(config, 401),
      REFRESH,
    );
    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1)); // refresh in flight

    const logout = AuthModel.logout();
    release(); // the refresh resolves AFTER logout started
    await logout;
    await pending;

    expect(events).toEqual(["refresh-done", "logout"]);
    expect(revoked).toEqual(["RT2"]); // the latest refresh token, not the rotated-away RT1
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
    const lockNames = new Set(lockRequest.mock.calls.map(([name]) => name));
    expect(lockNames).toEqual(new Set([`${APP_PREFIX}:auth-refresh:MAIN`]));
  });

  it("without Web Locks, logout still waits for this tab's refresh and revokes the rotated token", async () => {
    vi.stubGlobal("navigator", {});
    const events: string[] = [];
    const release = heldRefresh(events);
    const revoked: unknown[] = [];
    vi.spyOn(AuthModel.api, "post").mockImplementation(async (opts) => {
      events.push("logout");
      revoked.push((opts as { data?: { refreshToken?: string } }).data?.refreshToken);
      return { success: true } as never;
    });

    const http = makeClient(async (config) => httpError(config, 401), REFRESH);
    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));

    const logout = AuthModel.logout();
    release();
    await logout;
    await pending;

    expect(events).toEqual(["refresh-done", "logout"]);
    expect(revoked).toEqual(["RT2"]);
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("without Web Locks: 401s during a slow logout reject and never call /auth/refresh", async () => {
    vi.stubGlobal("navigator", {});
    const refresh = vi.spyOn(axios, "post");
    const logoutCall = deferred();
    vi.spyOn(AuthModel.api, "post").mockImplementation(async () => {
      await logoutCall.promise;
      return { success: true } as never;
    });

    const http = makeClient(async (config) => httpError(config, 401), REFRESH);
    const logout = AuthModel.logout();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => http.get("/users").catch((e: unknown) => e)),
    );
    logoutCall.resolve();
    await logout;

    for (const result of results) {
      expect(result).toMatchObject({ error_code: 401, message: "session_ended" });
    }
    expect(refresh).not.toHaveBeenCalled();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("logout sends the access token it held as Bearer, even if storage is cleared meanwhile", async () => {
    vi.stubGlobal("navigator", {});
    const post = vi.spyOn(AuthModel.api, "post").mockImplementation(async () => {
      return { success: true } as never;
    });

    const logout = AuthModel.logout();
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // another tab cleared it meanwhile
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
    await logout;

    expect(post).toHaveBeenCalledWith({
      url: "/auth/logout",
      data: { refreshToken: "RT1" },
      customHeaders: { authorization: "Bearer AT1" },
    });
  });

  it("logout stops waiting for a hung refresh after 15s and still revokes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", {});
    const hung = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await hung.promise; // settles only after the assertions
      return { data: { data: { tokens: { accessToken: "AT2" } } } };
    });
    const logoutPost = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);
    const http = makeClient(async (config) => httpError(config, 401), REFRESH);
    void http.get("/users").catch(() => {});
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1)); // refresh hung

    const logout = AuthModel.logout();
    await vi.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS - 1);
    expect(logoutPost).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await logout;

    expect(logoutPost).toHaveBeenCalledTimes(1);
    expect(getRefreshToken("MAIN")).toBeNull();
    hung.resolve();
    await vi.runAllTimersAsync();
    expect(getAccessToken("MAIN")).toBeNull(); // the late refresh stored nothing
    vi.useRealTimers();
  });

  it("logout proceeds without the lock when another tab holds it past 15s", async () => {
    vi.useFakeTimers();
    installFakeLocks();
    const logoutPost = vi
      .spyOn(AuthModel.api, "post")
      .mockResolvedValue({ success: true } as never);
    // Another tab holds the refresh lock and never lets go.
    void navigator.locks.request(`${APP_PREFIX}:auth-refresh:MAIN`, () => new Promise(() => {}));

    const logout = AuthModel.logout();
    await vi.advanceTimersByTimeAsync(SESSION_WAIT_TIMEOUT_MS);
    await logout;

    expect(logoutPost).toHaveBeenCalledTimes(1);
    expect(getRefreshToken("MAIN")).toBeNull();
    vi.useRealTimers();
  });

  it("a refresh refused after the session ended fires no session-expired", async () => {
    const refreshCall = deferred();
    vi.spyOn(axios, "post").mockImplementation(async () => {
      await refreshCall.promise;
      throw Object.assign(new Error("refused"), { response: { status: 401, data: {} } });
    });
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    const http = makeClient(async (config) => httpError(config, 401), REFRESH);

    const pending = http.get("/users").catch((e: unknown) => e);
    await vi.waitFor(() => expect(axios.post).toHaveBeenCalledTimes(1));
    endSession("logout");
    refreshCall.resolve();

    expect(await pending).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("logout", "MAIN");
    off();
  });
});

describe("cross-tab auth sync", () => {
  let onStorage: (event: { key: string | null }) => void;

  beforeEach(() => {
    installLocalStorage();
    vi.stubGlobal("window", {
      addEventListener: (_type: string, fn: typeof onStorage) => {
        onStorage = fn;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a logout in another tab signs this tab out and re-runs the guards", () => {
    persistAccessToken("AT", "MAIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN); // the other tab's logout
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a login in another tab drops the cached signed-out user and marks every query stale", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u1" } as never);
    queryClient.setQueryData([queryKeys.auth.me], null);
    queryClient.setQueryData(["users.list"], { data: [] });
    const stop = syncAuthWithOtherTabs(vi.fn());

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(queryClient.getQueryData([queryKeys.auth.me])).toBeUndefined();
    expect(queryClient.getQueryState(["users.list"])?.isInvalidated).toBe(true);
    stop();
  });

  it("a login in another tab loads the user; a token rotation is ignored", () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    const getMe = vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u1" } as never);
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT-rotated"); // another tab refreshed
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });
    onStorage({ key: STORAGE_KEYS.LANGUAGE });
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it("after this tab logs out, a login in another tab signs this tab in again", async () => {
    vi.stubGlobal("navigator", {});
    persistAccessToken("AT", "MAIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    vi.spyOn(AuthModel.api, "post").mockResolvedValue({ success: true } as never);
    vi.spyOn(AuthModel, "getMe").mockResolvedValue({ _id: "u2" } as never);
    const onChange = vi.fn();
    const stop = syncAuthWithOtherTabs(onChange);

    await AuthModel.logout(); // this tab's own logout: no storage event here
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "AT2"); // the other tab's login
    onStorage({ key: STORAGE_KEYS.ACCESS_TOKEN });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });
});
