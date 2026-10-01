import {
  getApiErrorMessage,
  isHmacError,
  isRefreshRefused,
  isTransientHttpError,
  isUnauthorizedError,
  refreshUnavailable,
  SessionEndedError,
  toApiError,
} from "@/services/core";
import { describe, expect, it } from "vitest";

/** Login-form error text: the server's message, not the generic fallback. */
describe("getApiErrorMessage", () => {
  it("shows the server's error_message from a 401 rejection", () => {
    const rejection = toApiError({
      isAxiosError: true,
      response: {
        status: 401,
        data: {
          success: false,
          message: "Invalid credentials",
          error_message: "Invalid credentials",
        },
      },
    });
    expect(getApiErrorMessage(rejection, "Sign in failed")).toBe("Invalid credentials");
  });

  it("falls back when the rejection carries no message", () => {
    expect(getApiErrorMessage({ error_code: 0 }, "Sign in failed")).toBe("Sign in failed");
    expect(getApiErrorMessage(null, "Sign in failed")).toBe("Sign in failed");
    expect(getApiErrorMessage(toApiError({}), "Sign in failed")).toBe("Sign in failed");
  });

  it("uses an Error's message", () => {
    expect(getApiErrorMessage(new Error("Network Error"), "x")).toBe("Network Error");
  });
});

const httpFailure = (status?: number) => ({
  isAxiosError: true,
  response: status === undefined ? undefined : { status, data: { success: false } },
});

describe("refresh failure classification", () => {
  it("only a 401 or 403 from the refresh call refuses the session", () => {
    expect(isRefreshRefused(httpFailure(401))).toBe(true);
    expect(isRefreshRefused(httpFailure(403))).toBe(true);
    for (const status of [undefined, 400, 408, 429, 500, 503]) {
      expect(isRefreshRefused(httpFailure(status))).toBe(false);
    }
    expect(isRefreshRefused(new Error("refresh_response_missing_access_token"))).toBe(false);
  });

  it("a transient refresh failure maps to a retryable non-401 rejection", () => {
    expect(refreshUnavailable(httpFailure(503))).toEqual({
      status: "error",
      error_code: 503,
      message: "refresh_unavailable",
      error_message: "refresh_unavailable",
      retryable: true,
    });
    expect(refreshUnavailable(httpFailure())).toMatchObject({ error_code: 0, retryable: true });
    expect(refreshUnavailable(new Error("malformed"))).toMatchObject({ error_code: 0 });
  });

  it("an ended session reads as a 401 session_ended", () => {
    const error = new SessionEndedError();
    expect(error).toMatchObject({ error_code: 401, message: "session_ended" });
    expect(isUnauthorizedError(error)).toBe(true);
  });

  it("offline, 408, 429 and 5xx are transient; 4xx are not", () => {
    for (const status of [undefined, 408, 429, 500]) {
      expect(isTransientHttpError(httpFailure(status))).toBe(true);
    }
    expect(isTransientHttpError(httpFailure(400))).toBe(false);
    expect(isTransientHttpError(httpFailure(401))).toBe(false);
  });
});

const hmacFailure = (status: number, errorType: string) => ({
  isAxiosError: true,
  response: { status, data: { success: false, message: "bad sig", errorType } },
});

describe("HMAC_ERROR classification", () => {
  it("toApiError keeps the backend errorType", () => {
    expect(toApiError(hmacFailure(401, "HMAC_ERROR"))).toMatchObject({
      error_code: 401,
      errorType: "HMAC_ERROR",
    });
  });

  it("toApiError marks an HMAC 401 retryable so the session-unavailable banner shows", () => {
    expect(toApiError(hmacFailure(401, "HMAC_ERROR")).retryable).toBe(true);
    expect(toApiError(hmacFailure(401, "AUTHENTICATION_ERROR")).retryable).toBeUndefined();
  });

  it("isHmacError reads normalized and raw axios errors", () => {
    expect(isHmacError({ error_code: 401, errorType: "HMAC_ERROR" })).toBe(true);
    expect(isHmacError(hmacFailure(401, "HMAC_ERROR"))).toBe(true);
    expect(isHmacError(hmacFailure(401, "AUTHENTICATION_ERROR"))).toBe(false);
    expect(isHmacError(null)).toBe(false);
  });

  it("isRefreshRefused: 401 HMAC_ERROR is not a refusal, other 401/403 still are", () => {
    expect(isRefreshRefused(hmacFailure(401, "HMAC_ERROR"))).toBe(false);
    expect(isRefreshRefused(hmacFailure(401, "AUTHENTICATION_ERROR"))).toBe(true);
    expect(isRefreshRefused(httpFailure(403))).toBe(true);
    expect(isRefreshRefused(httpFailure(503))).toBe(false);
  });

  it("isUnauthorizedError: a 401 HMAC_ERROR does not mean a signed-out session", () => {
    expect(isUnauthorizedError({ error_code: 401, errorType: "HMAC_ERROR" })).toBe(false);
    expect(isUnauthorizedError({ error_code: 401 })).toBe(true);
  });
});
