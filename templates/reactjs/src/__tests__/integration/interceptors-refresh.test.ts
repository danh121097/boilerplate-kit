import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { bearerOf, httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { Api, onSessionEnded } from "@/services/core";
import { getAccessToken, getRefreshToken } from "@/services/core/auth-token-storage";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/**
 * End-to-end test of 401 → refresh → replay through the real interceptors. The
 * app instance 401s while the Bearer token is stale and 200s once it's fresh;
 * the bare refresh client's `axios.post` is stubbed to mint a new token.
 */

const TOKEN_KEY = STORAGE_KEYS.ACCESS_TOKEN;
const EXEMPT_REFRESH = {
  endpoint: "/auth/refresh",
  skipPaths: ["/auth/login", "/auth/register", "/auth/logout"],
};
const NEW_TOKEN = {
  data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
} as never;

describe("interceptors — token refresh", () => {
  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
  });

  // Runs after each test's own onTestFinished cleanups, which unsubscribe
  // from the stubbed globals.
  beforeEach(({ onTestFinished }) => {
    onTestFinished(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it("refreshes once and replays the failed request transparently", async () => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    const post = vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return bearerOf(config) === "NEW"
        ? ok(config, { success: true, data: ["item"] })
        : httpError(config);
    });

    const result = await client.get("/users");

    expect((result as unknown as { data: string[] }).data).toEqual(["item"]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(getAccessToken("MAIN")).toBe("NEW");
    expect(getRefreshToken("MAIN")).toBe("NEW_R");
    expect(calls).toBe(2);
  });

  it("single-flights concurrent 401s into ONE refresh", async () => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    const post = vi
      .spyOn(axios, "post")
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(NEW_TOKEN), 10)));

    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? ok(config, { success: true, data: 1 }) : httpError(config),
    );

    const results = await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(3);
  });

  it("does NOT clear the refreshed token when the replay fails for a non-auth reason", async () => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? httpError(config, 500, { message: "boom" }) : httpError(config),
    );

    await expect(client.get("/users")).rejects.toMatchObject({ message: "boom" });
    expect(getAccessToken("MAIN")).toBe("NEW");
  });

  it("a 401 on the replayed request goes back to the caller and keeps the session (no infinite loop)", async () => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    const ended = vi.fn();
    const off = onSessionEnded(ended);
    onTestFinished(off);

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(calls).toBe(2);
    expect(getAccessToken("MAIN")).toBe("NEW");
    expect(ended).not.toHaveBeenCalled();
  });

  it("does not attempt refresh for anonymous traffic (no token)", async () => {
    let calls = 0;

    const post = vi.spyOn(axios, "post");
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/public")).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(1);
  });

  it.each([
    ["/auth/login", false],
    ["/auth/register", false],
    ["/auth/logout", false],
    ["/auth/refresh", false],
    ["/auth/login?next=/home", false],
    ["/x/auth/login", true],
    ["/auth/login/extra", true],
    ["/v2/auth/refresh", true],
  ])("401 on %s triggers a refresh: %s", async (url, refreshes) => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    const post = vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);
    const client = makeClient(async (config) => httpError(config), { MAIN: EXEMPT_REFRESH });

    await expect(client.get(url)).rejects.toBeTruthy();
    expect(post).toHaveBeenCalledTimes(refreshes ? 1 : 0);
  });
});
