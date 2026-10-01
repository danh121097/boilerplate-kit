import { httpError, MAIN_REFRESH, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import {
  Api,
  ApiInterceptors,
  isRefreshRefused,
  isUnauthorizedError,
  onSessionEnded,
} from "@/services/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * 401 handling that must never reload the page: credential endpoints skip the
 * refresh, a refused refresh (401/403) ends the session as expired, every
 * other refresh failure keeps it, and a 401 that is not refreshed (no refresh
 * config, anonymous, or a replay that is 401 again) just rejects to the caller.
 */

const refreshRefused = () =>
  Promise.reject(
    Object.assign(new Error("Request failed with status code 401"), {
      isAxiosError: true,
      response: { status: 401, data: { success: false, message: "Refresh token revoked" } },
    }),
  );

describe("interceptors — 401 without reload", () => {
  const reload = vi.fn();
  let ended: ReturnType<typeof vi.fn<(reason: string, service: string) => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    vi.stubGlobal("window", { location: { reload } });
    Api.setBaseURL("http://api.test", "MAIN");
    ended = vi.fn<(reason: string, service: string) => void>();
    unsubscribe = onSessionEnded(ended);
  });

  afterEach(() => {
    unsubscribe();
    reload.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("login 401 (wrong password) neither refreshes nor reloads", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) =>
      httpError(config, 401, { success: false, error_code: 401, message: "Invalid credentials" }),
    );

    await expect(
      client.post("/auth/login", { email: "a@b.c", password: "bad" }),
    ).rejects.toMatchObject({ error_code: 401, message: "Invalid credentials" });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("refresh refused → ends the session as expired and rejects 401, no reload", async () => {
    vi.spyOn(axios, "post").mockImplementation(refreshRefused);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(calls).toBe(1); // not replayed after a refused refresh
    expect(reload).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
  });

  it("refresh answered 403 ends the session and rejects with the original 401", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Request failed with status code 403"), {
        isAxiosError: true,
        response: { status: 403, data: { success: false, message: "Forbidden" } },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
  });

  for (const [label, status, code] of [
    ["400", 400, undefined],
    ["408", 408, undefined],
    ["429", 429, undefined],
    ["503", 503, undefined],
    ["a timeout", undefined, "ECONNABORTED"],
  ] as const) {
    it(`refresh failing with ${label} rejects as retryable and keeps the session`, async () => {
      vi.spyOn(axios, "post").mockRejectedValue(
        Object.assign(new Error("refresh failed"), {
          isAxiosError: true,
          code,
          response: status ? { status, data: { success: false, message: "busy" } } : undefined,
        }),
      );
      const client = makeClient(async (config) => httpError(config));

      await expect(client.get("/users")).rejects.toMatchObject({
        error_code: status ?? 0,
        retryable: true,
      });
      expect(ended).not.toHaveBeenCalled();
    });
  }

  it("a 401 HMAC_ERROR request is rejected once: no refresh, session kept", async () => {
    const post = vi.spyOn(axios, "post");
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config, 401, {
        success: false,
        message: "HMAC verification failed: timestamp expired!",
        errorType: "HMAC_ERROR",
      });
    });

    const error = await client.get("/users").catch((e: unknown) => e);

    expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR" });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(calls).toBe(1);
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("a refresh answered with 401 HMAC_ERROR keeps the session and rejects retryable", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("refresh failed"), {
        isAxiosError: true,
        response: {
          status: 401,
          data: { success: false, message: "HMAC verification failed!", errorType: "HMAC_ERROR" },
        },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    const error = await client.get("/users").catch((e: unknown) => e);

    expect(error).toMatchObject({
      error_code: 401,
      errorType: "HMAC_ERROR",
      message: "HMAC verification failed!",
      retryable: true,
    });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(isRefreshRefused(error)).toBe(false);
    expect(ended).not.toHaveBeenCalled();
  });

  it("a refresh answered with 401 AUTHENTICATION_ERROR still ends the session", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("refresh failed"), {
        isAxiosError: true,
        response: { status: 401, data: { success: false, errorType: "AUTHENTICATION_ERROR" } },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
  });

  it("the refresh call is capped by a 15s timeout", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(post.mock.calls[0]?.[2]).toMatchObject({ timeout: 15_000 });
  });

  it("transient refresh failure (network) does not end the session", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 0 });
    expect(ended).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("a replayed request that is 401 again rejects to the caller and keeps the session", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(calls).toBe(2);
    expect(ended).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("concurrent replays that are 401 again never fan out session-ended events", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    const client = makeClient(async (config) => httpError(config));

    const results = await Promise.allSettled([
      client.get("/a"),
      client.get("/b"),
      client.get("/c"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(ended).not.toHaveBeenCalled();
  });

  it("refresh refused for another service keeps the main session", async () => {
    Api.setBaseURL("http://admin.test", "ADMIN");
    vi.spyOn(axios, "post").mockImplementation(refreshRefused);
    const instance = axios.create({ adapter: async (config) => httpError(config) });
    const interceptors = new ApiInterceptors({ ADMIN: MAIN_REFRESH, MAIN: MAIN_REFRESH });
    interceptors.setupRequestInterceptor(instance, "ADMIN");
    interceptors.setupResponseInterceptor(instance);

    await expect(instance.get("/reports")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "ADMIN");
  });

  it("service without refresh config: 401 just rejects, no refresh, no reload", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config), {});

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("anonymous visitor (no session hint): 401 is final — no refresh call, no expiry", async () => {
    const post = vi.spyOn(axios, "post");
    let calls = 0;
    const client = makeClient(
      async (config) => {
        calls += 1;
        return httpError(config);
      },
      { MAIN: { ...MAIN_REFRESH, hasSession: () => false } },
    );

    await expect(client.get("/auth/me")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    expect(ended).not.toHaveBeenCalled();
  });

  it("session hint present: refreshes, and renews the hint on success", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    const onRefreshed = vi.fn();
    let calls = 0;
    const client = makeClient(
      async (config) => (++calls === 1 ? httpError(config) : ok(config, { success: true })),
      { MAIN: { ...MAIN_REFRESH, onRefreshed } },
    );

    await client.get("/users");
    expect(calls).toBe(2);
    expect(onRefreshed).toHaveBeenCalledTimes(1);
  });

  it("successful refresh + replay does not end the session", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true } } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(ended).not.toHaveBeenCalled();
  });
});
