import { AuthModel, readServerSession, fetchSessionUser } from "@/services/auth";
import { isUnauthorizedError, resetQueriesToSignedOut, serverApiGet } from "@/services/core";
import { QueryClient } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Session/profile reads: in the browser they go through the refreshing axios
 * Model (a 401 that survives the refresh = anonymous → null; other errors
 * surface), the SSR helper rejects instead of mapping failures to null, and
 * ending a session clears the whole query cache.
 */

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" };

describe("fetchSessionUser (browser)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the user from the refreshing Model", async () => {
    const getMe = vi.spyOn(AuthModel, "getMe").mockResolvedValue(USER);
    await expect(fetchSessionUser()).resolves.toEqual(USER);
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it("maps a 401 that survived the refresh to null (anonymous)", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 401, message: "unauthorized" });
    await expect(fetchSessionUser()).resolves.toBeNull();
  });

  it("surfaces non-401 errors to the query instead of null", async () => {
    vi.spyOn(AuthModel, "getMe").mockRejectedValue({ error_code: 503, message: "down" });
    await expect(fetchSessionUser()).rejects.toMatchObject({ error_code: 503 });
  });
});

describe("readServerSession (SSR)", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubServer(cookie: string | undefined, fetchImpl: () => Promise<unknown>) {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1" },
    }));
    vi.stubGlobal("useRequestHeaders", () => (cookie ? { cookie } : {}));
    vi.stubGlobal("$fetch", vi.fn(fetchImpl));
  }

  const unauthorized = () =>
    Promise.reject(
      Object.assign(new Error("fetch failed"), {
        statusCode: 401,
        data: { success: false, error_code: 401, message: "unauthorized" },
      }),
    );

  it("no session hint → null (anonymous) without any request", async () => {
    stubServer("PRISM_APP_LANGUAGE=en", unauthorized);
    await expect(readServerSession()).resolves.toBeNull();
    expect($fetch).not.toHaveBeenCalled();
  });

  it("no session hint + backend down → still null, no retry banner", async () => {
    stubServer(undefined, () =>
      Promise.reject(Object.assign(new Error("fetch failed"), { statusCode: 503 })),
    );
    await expect(readServerSession()).resolves.toBeNull();
  });

  it("session hint + 401 → rejects (expired access cookie; the browser refreshes)", async () => {
    stubServer("PRISM_APP_SESSION=1; accessToken=x", unauthorized);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 401 });
  });

  it("returns the signed-in user", async () => {
    stubServer("PRISM_APP_SESSION=1", async () => ({ success: true, data: { user: USER } }));
    await expect(readServerSession()).resolves.toEqual(USER);
  });

  it("non-401 failures reject while a session hint is set", async () => {
    stubServer("PRISM_APP_SESSION=1", () =>
      Promise.reject(Object.assign(new Error("fetch failed"), { statusCode: 503 })),
    );
    await expect(readServerSession()).rejects.toMatchObject({
      error_code: 503,
      retryable: true,
    });
  });

  it("never calls the refresh endpoint, even with the hint set and a 401", async () => {
    stubServer("PRISM_APP_SESSION=1", unauthorized);
    await expect(readServerSession()).rejects.toMatchObject({ error_code: 401 });
    const fetchMock = $fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/auth\/me$/);
  });
});

describe("serverApiGet", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubNuxt(fetchImpl: () => Promise<unknown>) {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1" },
    }));
    vi.stubGlobal("$fetch", vi.fn(fetchImpl));
  }

  it("rejects with the HTTP status instead of returning null", async () => {
    stubNuxt(() =>
      Promise.reject(
        Object.assign(new Error("fetch failed"), {
          statusCode: 500,
          data: { success: false, message: "boom" },
        }),
      ),
    );
    await expect(serverApiGet("/auth/me")).rejects.toMatchObject({
      error_code: 500,
      message: "boom",
    });
  });

  it("rejects 401 too (SSR cannot refresh — the browser resolves it)", async () => {
    stubNuxt(() => Promise.reject(Object.assign(new Error("unauthorized"), { statusCode: 401 })));
    await expect(serverApiGet("/auth/me")).rejects.toMatchObject({ error_code: 401 });
  });

  it("unwraps the envelope data on success", async () => {
    stubNuxt(async () => ({ success: true, data: { user: USER } }));
    await expect(serverApiGet("/auth/me")).resolves.toEqual({ user: USER });
  });
});

describe("server-side HMAC_ERROR", () => {
  const hmacBody = {
    success: false,
    message: "HMAC verification failed!",
    errorType: "HMAC_ERROR",
  };

  const hmacRejected = () =>
    Promise.reject(Object.assign(new Error("unauthorized"), { statusCode: 401, data: hmacBody }));

  beforeEach(() => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1" },
    }));
    vi.stubGlobal("useRequestHeaders", () => ({ cookie: "PRISM_APP_SESSION=1" }));
    vi.stubGlobal("$fetch", vi.fn(hmacRejected));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects with the HMAC errorType, which is not a signed-out session, and logs once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.resetModules();
    const { serverApiGet: freshGet } = await import("@/services/core/server-api");

    const error = await freshGet("/auth/me").catch((e: unknown) => e);
    await freshGet("/auth/me").catch(() => undefined);

    expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR", retryable: true });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("readServerSession rejects with it rather than resolving signed out", async () => {
    await expect(readServerSession()).rejects.toMatchObject({ errorType: "HMAC_ERROR" });
  });

  it("a plain 401 is still an unauthorized rejection and logs nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "$fetch",
      vi.fn(() =>
        Promise.reject(
          Object.assign(new Error("unauthorized"), {
            statusCode: 401,
            data: { errorType: "AUTHENTICATION_ERROR" },
          }),
        ),
      ),
    );
    const error = await serverApiGet("/auth/me").catch((e: unknown) => e);
    expect(isUnauthorizedError(error)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("resetQueriesToSignedOut", () => {
  it("drops every cached query and leaves the session as null", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["auth.me"], USER);
    queryClient.setQueryData(["users.list"], { data: [USER] });

    resetQueriesToSignedOut(queryClient, "auth.me");

    expect(queryClient.getQueryData(["users.list"])).toBeUndefined();
    expect(queryClient.getQueryData(["auth.me"])).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
  });
});
