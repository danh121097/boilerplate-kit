import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { bearerOf, httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
} from "@/services/core/auth-token-storage";
import axios from "axios";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

/**
 * End-to-end test of 401 → refresh → replay through the real interceptors with
 * async SecureStore. The app instance 401s while the Bearer token is stale and
 * 200s once it's fresh; the bare refresh client's `axios.post` is stubbed to mint
 * a new token.
 */

const NEW_TOKEN = {
  data: { success: true, data: { tokens: { accessToken: "NEW", refreshToken: "NEW_R" } } },
} as never;

describe("interceptors — token refresh (async storage)", () => {
  beforeEach(() => {
    resetSecureStore();
    Api.setBaseURL("http://api.test", "MAIN");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("refreshes once and replays the failed request transparently", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

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
    expect(await getAccessToken("MAIN")).toBe("NEW");
    expect(await getRefreshToken("MAIN")).toBe("NEW_R");
    expect(calls).toBe(2);
  });

  it("single-flights concurrent 401s into ONE refresh", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest
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
    await persistAccessToken("OLD", "MAIN");
    jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? httpError(config, 500, { message: "boom" }) : httpError(config),
    );

    await expect(client.get("/users")).rejects.toMatchObject({ message: "boom" });
    expect(await getAccessToken("MAIN")).toBe("NEW");
  });

  it("gives up after one retry (no infinite loop), clears the token and fires onSessionExpired", async () => {
    await persistAccessToken("OLD", "MAIN");
    jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);
    const onSessionExpired = jest.fn();

    let calls = 0;
    const client = makeClient(
      async (config) => {
        calls += 1;
        return httpError(config);
      },
      { MAIN: { endpoint: "/auth/refresh" } },
      onSessionExpired,
    );

    await expect(client.get("/users")).rejects.toBeTruthy();
    expect(calls).toBe(2);
    expect(await getAccessToken("MAIN")).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledWith("MAIN");
  });

  it("does not attempt refresh for anonymous traffic (no token) but fires onSessionExpired", async () => {
    const post = jest.spyOn(axios, "post");
    const onSessionExpired = jest.fn();
    let calls = 0;
    const client = makeClient(
      async (config) => {
        calls += 1;
        return httpError(config);
      },
      { MAIN: { endpoint: "/auth/refresh" } },
      onSessionExpired,
    );

    await expect(client.get("/public")).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    expect(onSessionExpired).toHaveBeenCalledWith("MAIN");
  });

  it("does not treat the refresh endpoint's own 401 as refreshable (no recursion)", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post");
    const onSessionExpired = jest.fn();

    const client = makeClient(
      async (config) => httpError(config),
      { MAIN: { endpoint: "/auth/refresh" } },
      onSessionExpired,
    );

    // A direct call to the refresh endpoint is not eligible for auto-refresh.
    await expect(client.post("/auth/refresh")).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled(); // bare refresh client never invoked
  });
});
