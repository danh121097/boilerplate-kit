import { loginSchema } from "@/services/auth/schema/login";
import { registerSchema } from "@/services/auth/schema/register";
import { describe, expect, it } from "vitest";

/** Form validation: failures carry i18n keys, translated where they render. */
describe("loginSchema", () => {
  it("accepts any non-empty password, so accounts made before the strength rule can sign in", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
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

describe("registerSchema", () => {
  it("still enforces the 8 character password rule", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
    const result = registerSchema.safeParse({ email: "a@b.co", password: "short" });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["validation.password_min"]);
  });
});
