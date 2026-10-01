import { loginSchema } from "@/services/auth/schema/login";
import { describe, expect, it } from "vitest";

/** Client-side login validation: failures carry i18n keys the form translates. */
describe("loginSchema", () => {
  const messages = (input: unknown) =>
    loginSchema.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];

  it("accepts any non-empty password, so a legacy short one still reaches the backend", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("rejects a malformed email with validation.email", () => {
    expect(messages({ email: "nope", password: "12345678" })).toEqual(["validation.email"]);
  });

  it("rejects an empty password with validation.password_required", () => {
    expect(messages({ email: "a@b.co", password: "" })).toEqual(["validation.password_required"]);
  });
});
