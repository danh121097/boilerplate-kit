import {
  ACCESS_PREFIX,
  issueTokens,
  REFRESH_PREFIX,
  userFromToken,
} from "@/services/auth/data/mock-auth-session";
import type { AuthUser } from "@/services/auth/types/auth";

const USER: AuthUser = {
  _id: "u1",
  email: "a@example.com",
  name: "A",
  role: "user",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const tokenFor = (user: unknown) => issueTokens(user as AuthUser).accessToken;

describe("mock session token", () => {
  it("round-trips a full AuthUser for both token kinds", () => {
    const { accessToken, refreshToken } = issueTokens(USER);

    expect(userFromToken(accessToken, ACCESS_PREFIX)).toEqual(USER);
    expect(userFromToken(refreshToken, REFRESH_PREFIX)).toEqual(USER);
  });

  it("accepts every role of the backend union", () => {
    for (const role of ["user", "admin", "super_admin"] as const) {
      expect(userFromToken(tokenFor({ ...USER, role }), ACCESS_PREFIX)).toMatchObject({ role });
    }
  });

  it.each([
    ["an unknown role", { ...USER, role: "root" }],
    ["a missing isActive", { ...USER, isActive: undefined }],
    ["a non-boolean isActive", { ...USER, isActive: "yes" }],
    ["a missing createdAt", { ...USER, createdAt: undefined }],
    ["a missing updatedAt", { ...USER, updatedAt: undefined }],
    ["a missing _id", { ...USER, _id: undefined }],
  ])("rejects a user with %s", (_label, user) => {
    expect(userFromToken(tokenFor(user), ACCESS_PREFIX)).toBeNull();
  });

  it("rejects a wrong prefix and a non-string token", () => {
    expect(userFromToken(tokenFor(USER), REFRESH_PREFIX)).toBeNull();
    expect(userFromToken(undefined, ACCESS_PREFIX)).toBeNull();
  });
});
