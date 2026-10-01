import { loginSchema } from "@/services/auth/schema/login";
import { describe, expect, it } from "vitest";

/** Login form validation: failures carry i18n keys, translated where they render. */
describe("loginSchema", () => {
  it("accepts a legacy short password: the backend decides if it is right", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(true);
  });

  it("reports an invalid email and an empty password as i18n keys", () => {
    const result = loginSchema.safeParse({ email: "nope", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "validation.email",
      "validation.password_required",
    ]);
  });
});
