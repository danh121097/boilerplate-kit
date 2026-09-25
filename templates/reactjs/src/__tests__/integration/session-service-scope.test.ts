import { httpError } from "@/__tests__/helpers/http-mocks";
import { queryClient } from "@/providers/query-client-provider";
import {
  Api,
  ApiInterceptors,
  endSession,
  getAccessToken,
  getRefreshToken,
  onSessionEnded,
  persistAccessToken,
  persistRefreshToken,
  redirectOnSessionExpired,
  registerServiceToken,
} from "@/services/core";
import { queryKeys } from "@/services/query-keys";
import { useAuthStore } from "@/stores/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxiosAdapter } from "axios";
import axios from "axios";

/**
 * Several services can each hold a session, but only the auth service's
 * session is the user's: another service's refused refresh clears that
 * service's tokens and nothing else.
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

/** An axios instance of `service` wired with the real interceptors, both services refreshable. */
function clientOf(service: string, adapter: AxiosAdapter) {
  const interceptors = new ApiInterceptors({
    MAIN: { endpoint: "/auth/refresh" },
    ADMIN: { endpoint: "/auth/refresh" },
  });
  const instance = axios.create({ adapter });
  interceptors.setupRequestInterceptor(instance, service);
  interceptors.setupResponseInterceptor(instance);
  return instance;
}

describe("session end is scoped to its service", () => {
  let stop: Array<() => void> = [];

  const redirect = vi.fn();
  const ended = vi.fn();

  beforeEach(() => {
    registerServiceToken("ADMIN", { access: "ADMIN_ACCESS", refresh: "ADMIN_REFRESH" });
    Api.setBaseURL("http://api.test", "MAIN");
    Api.setBaseURL("http://admin.test", "ADMIN");
    persistAccessToken("AT", "MAIN");
    persistRefreshToken("RT", "MAIN");
    persistAccessToken("ADMIN_AT", "ADMIN");
    persistRefreshToken("ADMIN_RT", "ADMIN");
    useAuthStore.setState({ isAuthenticated: true, user: { _id: "u1" } as never });
    queryClient.setQueryData([ME], { _id: "u1" });
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("refused"), { isAxiosError: true, response: { status: 401 } }),
    );
    stop = [redirectOnSessionExpired(redirect, "MAIN"), onSessionEnded(ended)];
  });

  afterEach(() => {
    stop.forEach((off) => off());
    redirect.mockReset();
    ended.mockReset();
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it("refresh failure of another service keeps the main session", async () => {
    const admin = clientOf("ADMIN", async (config) => httpError(config, 401));

    await expect(admin.get("/reports")).rejects.toMatchObject({ error_code: 401 });

    expect(ended).toHaveBeenCalledWith("expired", "ADMIN");
    expect(getAccessToken("ADMIN")).toBeNull();
    expect(getRefreshToken("ADMIN")).toBeNull();
    expect(getAccessToken("MAIN")).toBe("AT");
    expect(getRefreshToken("MAIN")).toBe("RT");
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, user: { _id: "u1" } });
    expect(queryClient.getQueryData([ME])).toEqual({ _id: "u1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refresh failure of the main service signs the user out and redirects to login", async () => {
    const main = clientOf("MAIN", async (config) => httpError(config, 401));

    await expect(main.get("/users")).rejects.toMatchObject({ error_code: 401 });

    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(getRefreshToken("MAIN")).toBeNull();
    expect(getAccessToken("ADMIN")).toBe("ADMIN_AT");
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null });
    expect(queryClient.getQueryData([ME])).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("a voluntary logout does not redirect", () => {
    endSession("logout", "MAIN");

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
  });
});
