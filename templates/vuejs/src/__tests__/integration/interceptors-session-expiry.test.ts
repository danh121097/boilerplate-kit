import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { Api, onSessionExpired } from "@/services/core";
import { getAccessToken, getRefreshToken } from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * 401 handling that must never reload the page: credential endpoints skip the
 * refresh, a refused refresh announces session expiry instead of reloading, a
 * transient refresh failure keeps the session, and a service without refresh
 * config just clears its tokens and rejects.
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
  let expired: ReturnType<typeof vi.fn<(service: string) => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    installLocalStorage();
    vi.stubGlobal("window", { location: { reload } });
    Api.setBaseURL("http://api.test", "MAIN");
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, "OLD");
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, "OLD_R");
    expired = vi.fn<(service: string) => void>();
    unsubscribe = onSessionExpired(expired);
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
    expect(expired).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
  });

  it("refresh refused → clears tokens, announces expiry, rejects 401, no reload", async () => {
    vi.spyOn(axios, "post").mockImplementation(REFRESH_REFUSED);
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(reload).not.toHaveBeenCalled();
    expect(expired).toHaveBeenCalledWith("MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  it("refresh answered 403 ends the session like a 401", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Request failed with status code 403"), {
        isAxiosError: true,
        response: { status: 403, data: { success: false, message: "Forbidden" } },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 403 });
    expect(expired).toHaveBeenCalledWith("MAIN");
    expect(getAccessToken("MAIN")).toBeNull();
    expect(getRefreshToken("MAIN")).toBeNull();
  });

  for (const [label, status, code] of [
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
      expect(expired).not.toHaveBeenCalled();
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

  it("transient refresh failure (network) keeps the tokens and does not expire", async () => {
    vi.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("Network Error"), { isAxiosError: true, code: "ERR_NETWORK" }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 0 });
    expect(expired).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBe("OLD");
    expect(getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("service without refresh config: 401 clears its tokens and rejects, no reload", async () => {
    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config), {});

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(post).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(getAccessToken("MAIN")).toBeNull();
  });

  it("successful refresh does not announce expiry", async () => {
    vi.spyOn(axios, "post").mockResolvedValue({
      data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
    } as never);
    let calls = 0;
    const client = makeClient(async (config) =>
      ++calls === 1 ? httpError(config) : ok(config, { success: true, data: 1 }),
    );

    await client.get("/users");
    expect(expired).not.toHaveBeenCalled();
  });
});
