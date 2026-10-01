import { resetSecureStore } from "@/__tests__/helpers/fake-secure-store";
import { httpError, makeClient, refreshFailure } from "@/__tests__/helpers/http-mocks";
import { Api, isUnauthorizedError, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import axios from "axios";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

const HMAC_BODY = {
  success: false,
  errorType: "HMAC_ERROR",
  message: "HMAC verification failed: timestamp expired!",
};

/**
 * How the real interceptors react when the refresh call itself fails: transient
 * failures keep the stored pair and surface a retryable error, while a refused
 * refresh (401/403) ends the session.
 */

describe("interceptors — token refresh failures (async storage)", () => {
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

  it("a request answered 401 HMAC_ERROR is not refreshed, retried or treated as a session end", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    const post = jest.spyOn(axios, "post");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const client = makeClient(async (config) => {
      calls += 1;
      return httpError(config, 401, HMAC_BODY);
    });

    await expect(client.get("/users")).rejects.toMatchObject({
      errorType: "HMAC_ERROR",
      message: HMAC_BODY.message,
    });
    expect(calls).toBe(1);
    expect(post).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("OLD");
    expect(await getRefreshToken("MAIN")).toBe("OLD_R");
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("a refresh answered 401 HMAC_ERROR keeps the session and rejects without an expired-session 401", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("refresh failed"), {
        isAxiosError: true,
        response: { status: 401, data: HMAC_BODY },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    const error = await client.get("/users").catch((e: unknown) => e);

    expect(error).toMatchObject({
      error_code: 401,
      errorType: "HMAC_ERROR",
      message: HMAC_BODY.message,
      retryable: true,
    });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(sessionEnded).not.toHaveBeenCalled();
    expect(await getAccessToken("MAIN")).toBe("OLD");
    expect(await getRefreshToken("MAIN")).toBe("OLD_R");
  });

  it("a refresh answered 401 AUTHENTICATION_ERROR still ends the session", async () => {
    await persistAccessToken("OLD", "MAIN");
    await persistRefreshToken("OLD_R", "MAIN");
    jest.spyOn(axios, "post").mockRejectedValue(
      Object.assign(new Error("refresh failed"), {
        isAxiosError: true,
        response: { status: 401, data: { success: false, errorType: "AUTHENTICATION_ERROR" } },
      }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(sessionEnded).toHaveBeenCalledWith("expired", "MAIN");
    expect(await getRefreshToken("MAIN")).toBeNull();
  });
});
