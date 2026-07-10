import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { bearerOf, httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { STORAGE_KEYS } from "@/enums";
import { Api } from "@/services/core";
import { getAccessToken, getRefreshToken } from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * End-to-end test of 401 → refresh → replay through the real interceptors. The
 * app instance 401s while the Bearer token is stale and 200s once it's fresh;
 * the bare refresh client's `axios.post` is stubbed to mint a new token.
 */

const TOKEN_KEY = STORAGE_KEYS.ACCESS_TOKEN;
const NEW_TOKEN = {
  data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
} as never;

describe("interceptors — token refresh", () => {
  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it("gives up after one retry (no infinite loop) and clears the token", async () => {
    localStorage.setItem(TOKEN_KEY, "OLD");
    vi.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/users")).rejects.toBeTruthy();
    expect(calls).toBe(2);
    expect(getAccessToken("MAIN")).toBeNull();
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
});
