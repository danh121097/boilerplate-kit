import { AppError } from "@/types";
import { describe, it, expect } from "vitest";

describe("AppError", () => {
  it("sets message, statusCode, errorType", () => {
    const err = new AppError({
      message: "fail",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
    expect(err.message).toBe("fail");
    expect(err.statusCode).toBe(400);
    expect(err.errorType).toBe("VALIDATION_ERROR");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("defaults statusCode=500 and errorType=INTERNAL_ERROR", () => {
    const err = new AppError({ message: "oops" });
    expect(err.statusCode).toBe(500);
    expect(err.errorType).toBe("INTERNAL_ERROR");
  });
});
