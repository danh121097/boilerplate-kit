import {
  isHmacError,
  isRefreshRefused,
  isUnauthorizedError,
  toApiError,
} from "@/services/core/api-errors";
import { describe, expect, it } from "vitest";

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error("failed"), { isAxiosError: true, response: { status, data } });

describe("HMAC_ERROR classification", () => {
  it("toApiError keeps the backend errorType", () => {
    const error = toApiError(
      axiosError(401, { success: false, message: "bad sig", errorType: "HMAC_ERROR" }),
    );
    expect(error).toMatchObject({ error_code: 401, errorType: "HMAC_ERROR" });
  });

  it("isHmacError reads normalized and raw axios errors", () => {
    expect(isHmacError({ error_code: 401, errorType: "HMAC_ERROR" })).toBe(true);
    expect(isHmacError(axiosError(401, { errorType: "HMAC_ERROR" }))).toBe(true);
    expect(isHmacError(axiosError(401, { errorType: "AUTHENTICATION_ERROR" }))).toBe(false);
    expect(isHmacError(null)).toBe(false);
  });

  it("isRefreshRefused: 401 HMAC_ERROR is not a refusal, other 401/403 still are", () => {
    expect(isRefreshRefused(axiosError(401, { errorType: "HMAC_ERROR" }))).toBe(false);
    expect(isRefreshRefused(axiosError(401, { errorType: "AUTHENTICATION_ERROR" }))).toBe(true);
    expect(isRefreshRefused(axiosError(403, {}))).toBe(true);
    expect(isRefreshRefused(axiosError(503, {}))).toBe(false);
  });

  it("isUnauthorizedError: a 401 HMAC_ERROR does not mean a signed-out session", () => {
    expect(isUnauthorizedError({ error_code: 401, errorType: "HMAC_ERROR" })).toBe(false);
    expect(isUnauthorizedError({ error_code: 401 })).toBe(true);
  });
});
