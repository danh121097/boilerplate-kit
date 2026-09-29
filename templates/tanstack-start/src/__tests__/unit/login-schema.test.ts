import { loginSchema } from "@/services/auth/login-schema";
import { describe, expect, it } from "vitest";

/** Client-side login validation: failures carry i18n keys the form translates. */
describe("loginSchema", () => {
  const messages = (input: unknown) =>
    loginSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

  it("accepts a valid email and an 8+ character password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
  });

  it("rejects a malformed email with validation.email", () => {
    expect(messages({ email: "nope", password: "12345678" })).toEqual(["validation.email"]);
  });

  it("rejects a short password with validation.password_min", () => {
    expect(messages({ email: "a@b.co", password: "1234567" })).toEqual(["validation.password_min"]);
  });
});
