import { requireMinRole } from "@/middleware/role";
import { AppError } from "@/types";
import { describe, it, expect, vi } from "vitest";

describe("requireMinRole middleware", () => {
  const mockRes = {} as any;

  it("calls next when role matches", () => {
    const mockNext = vi.fn();
    const req = {
      user: { userId: "1", email: "a@b.com", role: "admin" },
    } as any;
    requireMinRole("admin")(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("throws 403 when role does not match", () => {
    const mockNext = vi.fn();
    const req = {
      user: { userId: "1", email: "a@b.com", role: "user" },
    } as any;
    expect(() => requireMinRole("admin")(req, mockRes, mockNext)).toThrow(AppError);
  });

  it("throws 401 when no user on req", () => {
    const mockNext = vi.fn();
    const req = {} as any;
    expect(() => requireMinRole("admin")(req, mockRes, mockNext)).toThrow(AppError);
  });

  // Hierarchy: super_admin > admin > user. requireMinRole(X) allows X and anything higher.
  const reqWith = (role: string) => ({ user: { userId: "1", email: "a@b.com", role } }) as any;

  it("higher role passes a lower requirement (super_admin on admin route)", () => {
    const mockNext = vi.fn();
    requireMinRole("admin")(reqWith("super_admin"), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("admin passes a user-level requirement", () => {
    const mockNext = vi.fn();
    requireMinRole("user")(reqWith("admin"), mockRes, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it("lower role is rejected on a higher requirement (admin on super_admin route)", () => {
    const mockNext = vi.fn();
    expect(() => requireMinRole("super_admin")(reqWith("admin"), mockRes, mockNext)).toThrow(
      AppError,
    );
  });
});
