import { safeRedirect } from "@/services/core/session";

describe("safeRedirect", () => {
  it.each(["/", "/profile", "/users/42?tab=posts", "/a#frag"])("accepts in-app path %j", (p) => {
    expect(safeRedirect(p)).toBe(p);
  });

  it.each([
    undefined,
    null,
    42,
    "",
    "profile",
    "//evil.example",
    "/\\evil.example",
    "/a\\b",
    "/login/",
    "/pro\u007ffile",
    "https://evil.example/x",
    "/redirect?to=https://evil.example",
    "javascript:alert(1)",
    "/login",
    "/login?redirect=/x",
    "/pro\nfile",
    `/${"a".repeat(600)}`,
  ])("rejects %j and falls back to home", (p) => {
    expect(safeRedirect(p)).toBe("/");
  });

  it("returns the given fallback instead of home", () => {
    expect(safeRedirect("//evil.example", "/profile")).toBe("/profile");
    expect(safeRedirect(undefined, "/profile")).toBe("/profile");
  });

  it("uses the first value of an array param", () => {
    expect(safeRedirect(["/profile", "//evil"])).toBe("/profile");
  });
});
