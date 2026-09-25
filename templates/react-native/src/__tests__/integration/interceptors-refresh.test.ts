import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import {
  bearerOf,
  httpError,
  makeClient,
  ok,
  refreshFailure,
} from "@/__tests__/helpers/http-mocks";
import { Api, onSessionEnded, REFRESH_TIMEOUT_MS, SessionEndedError } from "@/services/core";
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
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
  let sessionEnded: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    resetSecureStore();
    Api.setBaseURL("http://api.test", "MAIN");
    sessionEnded = jest.fn();
    unsubscribe = onSessionEnded(sessionEnded);
  });

  afterEach(() => {
    unsubscribe();
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

  it("rejects a replayed request that 401s again with that 401 and keeps the session", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);

    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config, 401, { success: false, message: "forbidden here" });
    });

    await expect(client.get("/users")).rejects.toMatchObject({
      error_code: 401,
      message: "forbidden here",
    });
    expect(calls).toBe(2); // original + one replay, never a second refresh
    expect(post).toHaveBeenCalledTimes(1);
    expect(await getAccessToken("MAIN")).toBe("NEW");
    expect(await getRefreshToken("MAIN")).toBe("NEW_R");
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("passes an anonymous 401 through without a refresh or session expiry", async () => {
    let calls = 0;

    const post = jest.spyOn(axios, "post");
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config);
    });

    await expect(client.get("/public")).rejects.toMatchObject({
      error_code: 401,
      message: "expired",
    });
    expect(post).not.toHaveBeenCalled();
    expect(calls).toBe(1);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("passes a credential endpoint's 401 through untouched even with a stored session", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post");
    const client = makeClient(async (config) =>
      httpError(config, 401, { message: "bad credentials" }),
    );

    await expect(client.post("/auth/logout", { refreshToken: "R" })).rejects.toMatchObject({
      message: "bad credentials",
    });
    await expect(client.post("/auth/login?next=1", {})).rejects.toMatchObject({
      message: "bad credentials",
    });
    expect(post).not.toHaveBeenCalled();
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("OLD");
  });

  it("rejects a 401 that lands after the session was cleared as session_ended, without refreshing", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post");
    const client = makeClient(async (config) => {
      await clearAuthTokens(); // logout lands while the request is in flight
      return httpError(config);
    });

    const error = await client.get("/users").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionEndedError);
    expect(error).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(post).not.toHaveBeenCalled();
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it("does not treat the refresh endpoint's own 401 as refreshable (no recursion)", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post");
    const client = makeClient(async (config) => httpError(config));

    // A direct call to the refresh endpoint is not eligible for auto-refresh.
    await expect(client.post("/auth/refresh")).rejects.toBeTruthy();
    expect(post).not.toHaveBeenCalled(); // bare refresh client never invoked
  });

  it("sends the refresh call with a timeout", async () => {
    await persistAccessToken("OLD", "MAIN");
    const post = jest.spyOn(axios, "post").mockResolvedValue(NEW_TOKEN);
    const client = makeClient(async (config) =>
      bearerOf(config) === "NEW" ? ok(config, { success: true, data: 1 }) : httpError(config),
    );

    await client.get("/users");

    expect(post.mock.calls[0]?.[2]).toMatchObject({ timeout: REFRESH_TIMEOUT_MS });
  });

  it.each([
    ["offline", refreshFailure("ERR_NETWORK"), 0],
    ["timed out", refreshFailure("ECONNABORTED"), 0],
    ["rate-limited (429)", refreshFailure("ERR_BAD_REQUEST", 429), 429],
    ["server error (503)", refreshFailure("ERR_BAD_RESPONSE", 503), 503],
    ["a bad request (400)", refreshFailure("ERR_BAD_REQUEST", 400), 400],
  ])(
    "keeps tokens and rejects with a retryable error when the refresh is %s",
    async (_label, failure, httpStatus) => {
      await persistAccessToken("OLD", "MAIN");
      await persistRefreshToken("OLD_R", "MAIN");
      jest.spyOn(axios, "post").mockRejectedValue(failure);
      const client = makeClient(async (config) => httpError(config));

      const error = await client.get("/users").catch((e: unknown) => e);

      expect(error).toEqual({
        status: "error",
        error_code: httpStatus,
        message: "refresh_unavailable",
        error_message: "refresh_unavailable",
        retryable: true,
      });
      expect(sessionEnded).not.toHaveBeenCalled();
      expect(await getAccessToken("MAIN")).toBe("OLD");
      expect(await getRefreshToken("MAIN")).toBe("OLD_R");
    },
  );

  it("keeps tokens when the refresh answers 200 without an access token", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    jest.spyOn(axios, "post").mockResolvedValue({ data: { success: true, data: {} } } as never);
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({
      error_code: 0,
      message: "refresh_unavailable",
      retryable: true,
    });
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("OLD");
    expect(await getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it.each([401, 403])(
    "ends the session and rejects with the original 401 when the refresh endpoint answers %s",
    async (status) => {
      await persistAccessToken("OLD", "MAIN");
      await persistRefreshToken("OLD_R", "MAIN");
      jest.spyOn(axios, "post").mockRejectedValue(refreshFailure("ERR_BAD_REQUEST", status));
      const client = makeClient(async (config) => httpError(config));

      await expect(client.get("/users")).rejects.toMatchObject({
        error_code: 401,
        message: "expired",
      });
      expect(sessionEnded).toHaveBeenCalledTimes(1);
      expect(sessionEnded).toHaveBeenCalledWith("expired", "MAIN");
      expect(await getAccessToken("MAIN")).toBeNull();
      expect(await getRefreshToken("MAIN")).toBeNull();
    },
  );
});
