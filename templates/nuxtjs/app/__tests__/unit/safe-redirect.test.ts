import { safeRedirect } from "@/utils/safe-redirect";
import { describe, expect, it } from "vitest";

describe("safeRedirect", () => {
  it("keeps same-origin paths (with query and hash)", () => {
    expect(safeRedirect("/users?page=2#top")).toBe("/users?page=2#top");
    expect(safeRedirect("/")).toBe("/");
    expect(safeRedirect("/login-help")).toBe("/login-help");
  });

  it("rejects control characters URL parsers would strip (/\t/evil → //evil)", () => {
    for (const bad of [
      "/\t/evil.test",
      "/\n/evil.test",
      "/\r/evil.test",
      "/users\u0000",
      "/\u001F/x",
      "/\u007F/x",
    ]) {
      expect(safeRedirect(bad)).toBe("/");
    }
    expect(safeRedirect(decodeURIComponent("%2F%09%2Fevil.com"))).toBe("/");
    expect(safeRedirect(decodeURIComponent("%2F%0A%2Fevil.com"))).toBe("/");
  });

  it("rejects off-origin and malformed targets", () => {
    for (const bad of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/a\\b",
      "/redirect?to=https://evil.test",
      "users",
      "",
      null,
      undefined,
      42,
      ["/a"],
    ]) {
      expect(safeRedirect(bad)).toBe("/");
    }
  });

  it("rejects values longer than 512 characters", () => {
    expect(safeRedirect(`/${"a".repeat(511)}`)).toBe(`/${"a".repeat(511)}`);
    expect(safeRedirect(`/${"a".repeat(512)}`)).toBe("/");
  });

  it("never sends the user back to the login page", () => {
    for (const bad of ["/login", "/login/", "/login?redirect=/users", "/login#x"]) {
      expect(safeRedirect(bad)).toBe("/");
    }
  });

  it("allows deeper paths under /login, such as an auth callback", () => {
    expect(safeRedirect("/login/callback")).toBe("/login/callback");
    expect(safeRedirect("/login/callback?code=1")).toBe("/login/callback?code=1");
  });

  it("uses the given fallback", () => {
    expect(safeRedirect("//evil.test", "/home")).toBe("/home");
  });
});
