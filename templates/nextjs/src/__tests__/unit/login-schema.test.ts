import { loginSchema } from "@/services/auth/login-schema";
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
  it("accepts a valid email and an 8+ character password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12345678" }).success).toBe(true);
  });

  it("rejects a malformed email and a short password with i18n keys", () => {
    expect(messagesOf({ email: "nope", password: "1234567" })).toEqual({
      email: "validation.email",
      password: "validation.password_min",
    });
  });

  it("rejects empty fields the same way", () => {
    expect(messagesOf({ email: "", password: "" })).toEqual({
      email: "validation.email",
      password: "validation.password_min",
    });
  });

  it.each([en, ja])("every message key exists in the locale", (locale) => {
    expect(locale.validation.email).toBeTruthy();
    expect(locale.validation.password_min).toBeTruthy();
  });
});
