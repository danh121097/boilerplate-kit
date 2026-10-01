import { loginSchema } from "@/services/auth/schema/login";
import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en";
import ja from "@/i18n/locales/ja";

/** The message key of each failing field. */
function messagesOf(input: unknown): Record<string, string> {
  const result = loginSchema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
  );
}

describe("login schema", () => {
  it("accepts a valid email and any non-empty password, including a legacy short one", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("rejects a malformed email with an i18n key", () => {
    expect(messagesOf({ email: "nope", password: "1234567" })).toEqual({
      email: "validation.email",
    });
  });

  it("rejects empty fields the same way", () => {
    expect(messagesOf({ email: "", password: "" })).toEqual({
      email: "validation.email",
      password: "validation.password_required",
    });
  });

  it.each([en, ja])("every message key exists in the locale", (locale) => {
    expect(locale.validation.email).toBeTruthy();
    expect(locale.validation.password_required).toBeTruthy();
  });
});
