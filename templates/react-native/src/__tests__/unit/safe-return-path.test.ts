import { safeReturnPath } from "@/services/core/session";

jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore(),
);

describe("safeReturnPath", () => {
  it.each(["/", "/profile", "/users/42?tab=posts", "/a#frag"])("accepts in-app path %j", (p) => {
    expect(safeReturnPath(p)).toBe(p);
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
    expect(safeReturnPath(p)).toBe("/");
  });

  it("uses the first value of an array param", () => {
    expect(safeReturnPath(["/profile", "//evil"])).toBe("/profile");
  });
});
