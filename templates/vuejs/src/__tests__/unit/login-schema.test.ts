import { loginSchema } from "@/services/auth/schema/login";
import { describe, expect, it } from "vitest";

/** Login form validation: failures carry i18n keys, translated where they render. */
describe("loginSchema", () => {
  it("accepts a valid email and any non-empty password, including a legacy short one", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "abc" }).success).toBe(true);
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
