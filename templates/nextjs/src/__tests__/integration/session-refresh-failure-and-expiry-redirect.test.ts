import { httpError, ok } from "@/__tests__/helpers/http-mocks";
import { refreshError, setupRefreshClient as setup } from "@/__tests__/helpers/session-browser";
import { AuthModel } from "@/services/auth";
import {
  Api,
  ApiInterceptors,
  getSessionEpoch,
  hasSessionHint,
  loginPathWithReturn,
  markSessionActive,
  onSessionEnded,
  redirectOnSessionExpired,
  safeRedirect,
} from "@/services/core";
import { isRefreshRefused, isUnauthorizedError } from "@/services/core/api-errors";
import { makeQueryClient, resetQueriesOnSessionEnd } from "@/services/core/query-client";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/**
 * A failed refresh ends the session instead of reloading (a transient one keeps
 * it), a refused refresh of a hinted session redirects to /login, and the
 * same-origin return path used after a session expires.
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

  it("refresh failure ends the session without reloading and rejects with the original 401", async () => {
    const { post, reload, client } = setup(true);
    post.mockRejectedValue(refreshError({ status: 401 }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(reload).not.toHaveBeenCalled();
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
      onTestFinished(off);

      const http = client(async (config) => httpError(config, 401));

      const error = await http.get("/users").catch((e: unknown) => e);
      expect(error).toMatchObject({ retryable: true });
      expect((error as { error_code: number }).error_code).not.toBe(401);
      expect(ended).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
      expect(hasSessionHint()).toBe(true);
    },
  );

  it("a 401 HMAC_ERROR request is rejected once: no refresh, session and hint kept", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);
    let calls = 0;
    const http = client(async (config) => {
      calls += 1;
      return httpError(config, 401, {
        success: false,
        message: "HMAC verification failed: timestamp expired!",
        errorType: "HMAC_ERROR",
      });
    });

    const error = await http.get("/users").catch((e: unknown) => e);

    expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR", retryable: true });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(calls).toBe(1);
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(true);
  });

  it("a refresh answered with 401 HMAC_ERROR keeps the session and rejects retryable", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(
      refreshError({
        status: 401,
        errorType: "HMAC_ERROR",
        message: "HMAC verification failed: timestamp expired!",
      }),
    );
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    const error = await http.get("/users").catch((e: unknown) => e);
    expect(error).toMatchObject({
      retryable: true,
      errorType: "HMAC_ERROR",
      error_code: 401,
      message: "HMAC verification failed: timestamp expired!",
      error_message: "HMAC verification failed: timestamp expired!",
    });
    expect(isRefreshRefused(error)).toBe(false);
    expect(isUnauthorizedError(error)).toBe(false);
    expect(ended).not.toHaveBeenCalled();
    expect(hasSessionHint()).toBe(true);
  });

  it("a refresh answered with 401 AUTHENTICATION_ERROR still ends the session", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 401, errorType: "AUTHENTICATION_ERROR" }));
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(hasSessionHint()).toBe(false);
  });

  it("the refresh request gives up after 15s so a hung refresh cannot stall requests", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockResolvedValue({ data: {} });
    const http = client(async (config) =>
      config._retry ? ok(config, { success: true, data: 1 }) : httpError(config, 401),
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
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(hasSessionHint()).toBe(false);
  });

  it("redirects to /login when a hinted session's refresh is refused", async () => {
    markSessionActive();
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 401 }));
    const redirect = vi.fn();
    const off = redirectOnSessionExpired(redirect);
    onTestFinished(off);

    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("never redirects an anonymous visitor (no hint) or on a transient failure", async () => {
    const { post, client } = setup(hasSessionHint);
    post.mockRejectedValue(refreshError({ status: 503 }));
    const redirect = vi.fn();
    const off = redirectOnSessionExpired(redirect);
    onTestFinished(off);
    const http = client(async (config) => httpError(config, 401));

    await expect(http.get("/auth/me")).rejects.toMatchObject({ error_code: 401 }); // anonymous
    expect(post).not.toHaveBeenCalled();

    markSessionActive();
    await expect(http.get("/users")).rejects.toMatchObject({ retryable: true }); // transient
    expect(redirect).not.toHaveBeenCalled();

    await AuthModel.logout().catch(() => {}); // logout is not a redirect trigger
    expect(redirect).not.toHaveBeenCalled();
  });
  it("a refused refresh of another service keeps the main session", async () => {
    markSessionActive();
    const post = vi.spyOn(axios, "post").mockRejectedValue(refreshError({ status: 401 }));
    Api.setBaseURL("http://billing.test", "BILLING");
    const interceptors = new ApiInterceptors({
      BILLING: { endpoint: "/auth/refresh", hasSession: () => true },
    });
    const billing = axios.create({ adapter: async (config) => httpError(config, 401) });
    interceptors.setupRequestInterceptor(billing, "BILLING");
    interceptors.setupResponseInterceptor(billing);

    const queryClient = makeQueryClient();
    queryClient.setQueryData(["auth.me"], { _id: "1" });
    const offReset = resetQueriesOnSessionEnd(queryClient, "auth.me");
    onTestFinished(offReset);
    const redirect = vi.fn();
    const offRedirect = redirectOnSessionExpired(redirect);
    onTestFinished(offRedirect);
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);
    const mainEpoch = getSessionEpoch("MAIN");
    const billingEpoch = getSessionEpoch("BILLING");

    await expect(billing.get("/invoices")).rejects.toMatchObject({ error_code: 401 });

    expect(post).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith("expired", "BILLING");
    expect(getSessionEpoch("BILLING")).toBe(billingEpoch + 1);
    // The main session is untouched: hint, epoch, cache and route all stay.
    expect(hasSessionHint()).toBe(true);
    expect(getSessionEpoch("MAIN")).toBe(mainEpoch);
    expect(queryClient.getQueryData(["auth.me"])).toEqual({ _id: "1" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("return path after session expiry", () => {
  it("login path carries the current path", () => {
    expect(loginPathWithReturn("/users?page=2")).toBe("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it.each([
    ["/users?page=2", "/users?page=2"],
    ["/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/users\\x", "/"],
    ["https://evil.example", "/"],
    ["/r?next=https://evil.example", "/"],
    ["users", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/ok\u007F", "/"],
    ["/login", "/"],
    ["/login/", "/"],
    ["/login?redirect=%2Fusers", "/"],
    ["/login-help", "/login-help"],
    [null, "/"],
  ])("safeRedirect(%j) → %j", (value, expected) => {
    expect(safeRedirect(value)).toBe(expected);
  });

  it("safeRedirect accepts up to 512 characters and rejects longer values", () => {
    const max = `/${"a".repeat(511)}`;
    expect(safeRedirect(max)).toBe(max);
    expect(safeRedirect(`${max}a`)).toBe("/");
  });
});
