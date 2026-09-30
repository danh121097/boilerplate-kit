import { AppError } from "@/types";
import { validatePasswordStrength } from "@/utils/password";
import { describe, it, expect } from "vitest";

describe("validatePasswordStrength", () => {
  it("accepts valid password", () => {
    expect(() => validatePasswordStrength("Password1!")).not.toThrow();
  });

  it("rejects short password", () => {
    expect(() => validatePasswordStrength("Pa1!")).toThrow(AppError);
  });

  it("rejects missing uppercase", () => {
    expect(() => validatePasswordStrength("password1!")).toThrow(AppError);
  });

  it("rejects missing lowercase", () => {
    expect(() => validatePasswordStrength("PASSWORD1!")).toThrow(AppError);
  });

  it("rejects missing digit", () => {
    expect(() => validatePasswordStrength("Password!!")).toThrow(AppError);
  });

  it("rejects missing special char", () => {
    expect(() => validatePasswordStrength("Password11")).toThrow(AppError);
  });
});
