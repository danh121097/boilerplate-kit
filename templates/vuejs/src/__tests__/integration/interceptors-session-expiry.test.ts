import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, MAIN_REFRESH, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { Api, ApiInterceptors, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  registerServiceToken,
} from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * 401 handling that must never reload the page: credential endpoints skip the
 * refresh, a refused refresh (401/403) ends the session instead of reloading,
 * every other refresh failure keeps it, and a 401 that is not refreshed (no
 * refresh config, or a replay that is 401 again) just rejects to the caller.
 */

const REFRESH_REFUSED = () =>
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
    installLocalStorage();
    vi.stubGlobal("window", { location: { reload } });
    Api.setBaseURL("http://api.test", "MAIN");
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "OLD");
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, "OLD_R");
    ended = vi.fn<(reason: string, service: string) => void>();
    unsubscribe = onSessionEnded(ended);
  });

  afterEach(() => {
    unsubscribe();
    reload.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("login 401 (wrong password) neither refreshes nor reloads nor drops the session", async () => {
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
    expect(getAccessToken("MAIN")).toBe("OLD");
  });

  it("refresh refused → clears tokens, ends the session as expired, rejects 401, no reload", async () => {
    vi.spyOn(axios, "post").mockImplementation(REFRESH_REFUSED);
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(reload).not.toHaveBeenCalled();
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
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
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
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
      expect(getAccessToken("MAIN")).toBe("OLD");
      expect(getRefreshToken("MAIN")).toBe("OLD_R");
    });
  }

  it("the refresh call is capped by a 15s timeout", async () => {
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "NEW" } } },
    } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(post.mock.calls[0]?.[2]).toMatchObject({ timeout: 15_000 });
  });

  it("transient refresh failure (network) keeps the tokens and the session", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 0 });
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("refresh answering 200 without an access token is transient and keeps the session", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({ data: { success: true, data: {} } } as never);
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 0, retryable: true });
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("a replayed request that is 401 again rejects to the caller and keeps the session", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
    } as never);
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(calls).toBe(2);
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("NEW");
    expect(getRefreshToken("MAIN")).toBe("NEW_R");
  });

  it("concurrent replays that are 401 again never fan out session-ended events", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "NEW" } } },
    } as never);
    const client = makeClient(async (config) => httpError(config));

    const results = await Promise.allSettled([
      client.get("/a"),
      client.get("/b"),
      client.get("/c"),
    ]);

    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("NEW");
  });

  it("service without refresh config: 401 just rejects and keeps its tokens, no reload", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config), {});

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
  });

  it("refresh refused for another service keeps the main session", async () => {
    Api.setBaseURL("http://admin.test", "ADMIN");
    registerServiceToken("ADMIN", { access: "ADMIN_ACCESS", refresh: "ADMIN_REFRESH" });
    localStorage.setItem("ADMIN_ACCESS", "ADMIN_OLD");
    vi.spyOn(axios, "post").mockImplementation(REFRESH_REFUSED);
    const instance = axios.create({ adapter: async (config) => httpError(config) });
    const interceptors = new ApiInterceptors({ ADMIN: MAIN_REFRESH, MAIN: MAIN_REFRESH });
    interceptors.setupRequestInterceptor(instance, "ADMIN");
    interceptors.setupResponseInterceptor(instance);

    await expect(instance.get("/reports")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledExactlyOnceWith("expired", "ADMIN");
    expect(getAccessToken("ADMIN")).toBeNull();
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("successful refresh does not end the session", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
    } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(ended).not.toHaveBeenCalled();
  });
});
