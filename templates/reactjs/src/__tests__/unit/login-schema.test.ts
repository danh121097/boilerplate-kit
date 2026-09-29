import { loginSchema } from "@/services/auth/login-schema";
import { describe, expect, it } from "vitest";

/** Login form validation: failures carry i18n keys, translated where they render. */
describe("loginSchema", () => {
  it("accepts a valid email and an 8+ character password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
  });

  it("reports an invalid email and a short password as i18n keys", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "short" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "validation.email",
      "validation.password_min",
    ]);
  });
});
