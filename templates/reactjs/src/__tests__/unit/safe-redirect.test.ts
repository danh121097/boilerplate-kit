import { safeRedirect } from "@/services/core/session";
import { describe, expect, it } from "vitest";

/** The same-origin return path used after a session expires. */
describe("return path after session expiry", () => {
  it.each([
    ["/users?page=2", "/users?page=2"],
    ["/", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/users\\x", "/"],
    ["https://evil.example", "/"],
    ["/r?next=https://evil.example", "/"],
    ["users", "/"],
    ["/\t/evil.example", "/"],
    ["/\n/evil.example", "/"],
    ["/ok\u007F", "/"],
    ["/login", "/"],
    ["/login/", "/"],
    ["/login?redirect=%2Fusers", "/"],
    ["/login-help", "/login-help"],
    [undefined, "/"],
  ])("safeRedirect(%j) → %j", (value, expected) => {
    expect(safeRedirect(value)).toBe(expected);
  });

  it("safeRedirect accepts up to 512 characters and rejects longer values", () => {
    const max = `/${"a".repeat(511)}`;
    expect(safeRedirect(max)).toBe(max);
    expect(safeRedirect(`${max}a`)).toBe("/");
  });
});
