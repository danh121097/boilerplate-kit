import { getApiErrorMessage, toApiError } from "@/services/core";
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
