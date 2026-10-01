import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { httpError, makeClient, ok } from "@/__tests__/helpers/http-mocks";
import { Api, isUnauthorizedError, onSessionEnded } from "@/services/core";
import {
  getAccessToken,
  getRefreshToken,
  persistAccessToken,
  persistRefreshToken,
} from "@/services/core/auth-token-storage";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import axios from "axios";

/**
 * A backend `401` + `errorType: "HMAC_ERROR"` blames the request signature or
 * the clock, not the session: no refresh, no replay, no session end. A real
 * `AUTHENTICATION_ERROR` on the refresh call must still end the session.
 */

const HMAC_BODY = {
  success: false,
  errorType: "HMAC_ERROR",
  message: "HMAC verification failed: timestamp expired!",
};

function refreshRejectedWith(data: unknown) {
  return Object.assign(new Error("refresh failed"), {
    isAxiosError: true,
    response: { status: 401, data },
  });
}

describe("interceptors — HMAC_ERROR", () => {
  let post: ReturnType<typeof vi.spyOn>;
  let ended: ReturnType<typeof vi.fn<(reason: string, service: string) => void>>;

  beforeEach(() => {
    installLocalStorage();
    Api.setBaseURL("http://api.test", "MAIN");
    persistAccessToken("OLD");
    persistRefreshToken("RT");
    post = vi.spyOn(axios, "post");
    ended = vi.fn<(reason: string, service: string) => void>();
    onTestFinished(onSessionEnded(ended));
  });

  afterEach(() => vi.restoreAllMocks());

  it("a request answered 401 HMAC_ERROR is not refreshed, retried or treated as a session end", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
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
    expect(getAccessToken()).toBe("OLD");
    expect(getRefreshToken()).toBe("RT");
    expect(ended).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("an envelope 401 HMAC_ERROR (HTTP 200 body) is not refreshed either", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = makeClient(async (config) =>
      ok(config, { ...HMAC_BODY, error_code: 401, error_message: HMAC_BODY.message }),
    );

    await expect(client.get("/users")).rejects.toMatchObject({ errorType: "HMAC_ERROR" });
    expect(post).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it("a refresh answered 401 HMAC_ERROR keeps the session and is not an unauthorized rejection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    post.mockRejectedValue(refreshRejectedWith(HMAC_BODY));
    const client = makeClient(async (config) => httpError(config));

    const error = await client.get("/users").catch((e: unknown) => e);

    expect(error).toMatchObject({
      errorType: "HMAC_ERROR",
      error_code: 401,
      message: HMAC_BODY.message,
      retryable: true,
    });
    expect(isUnauthorizedError(error)).toBe(false);
    expect(ended).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe("OLD");
    expect(getRefreshToken()).toBe("RT");
  });

  it("a refresh answered 401 AUTHENTICATION_ERROR still ends the session", async () => {
    post.mockRejectedValue(
      refreshRejectedWith({ success: false, errorType: "AUTHENTICATION_ERROR" }),
    );
    const client = makeClient(async (config) => httpError(config));

    await expect(client.get("/users")).rejects.toMatchObject({ error_code: 401 });
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(getRefreshToken()).toBeNull();
  });
});
