import {
  isHmacError,
  isRefreshRefused,
  isSessionGoneError,
  isUnauthorizedError,
  toApiError,
} from "@/services/core";
import { describe, expect, it } from "vitest";

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error("failed"), { isAxiosError: true, response: { status, data } });

describe("HMAC_ERROR classification", () => {
  it("toApiError carries errorType from the response body", () => {
    const error = toApiError(axiosError(401, { success: false, errorType: "HMAC_ERROR" }));
    expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR" });
  });

  it("isHmacError reads raw axios errors and normalized ones", () => {
    const raw = axiosError(401, { errorType: "HMAC_ERROR" });
    expect(isHmacError(raw)).toBe(true);
    expect(isHmacError(toApiError(raw))).toBe(true);
    expect(isHmacError(axiosError(401, { errorType: "AUTHENTICATION_ERROR" }))).toBe(false);
    expect(isHmacError(null)).toBe(false);
  });

  it("an HMAC 401 is neither a refused refresh nor an unauthorized session", () => {
    const hmac = axiosError(401, { errorType: "HMAC_ERROR" });
    expect(isRefreshRefused(hmac)).toBe(false);
    expect(isUnauthorizedError(toApiError(hmac))).toBe(false);
  });

  it("other 401/403 responses stay refused / unauthorized", () => {
    const auth = axiosError(401, { errorType: "AUTHENTICATION_ERROR" });
    expect(isRefreshRefused(auth)).toBe(true);
    expect(isRefreshRefused(axiosError(403, {}))).toBe(true);
    expect(isUnauthorizedError(toApiError(auth))).toBe(true);
  });
});

describe("isSessionGoneError", () => {
  it("is true for a 401 and a 404, false for HMAC, 5xx and network errors", () => {
    expect(isSessionGoneError({ error_code: 401 })).toBe(true);
    expect(isSessionGoneError({ error_code: 404 })).toBe(true);
    expect(isSessionGoneError(toApiError(axiosError(401, { errorType: "HMAC_ERROR" })))).toBe(
      false,
    );
    expect(isSessionGoneError({ error_code: 500 })).toBe(false);
    expect(isSessionGoneError({ error_code: 0, error_message: "Network Error" })).toBe(false);
  });
});
