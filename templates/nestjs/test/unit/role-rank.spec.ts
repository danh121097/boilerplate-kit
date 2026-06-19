/**
 * Unit tests for ROLE_RANK — verifies the rank ordering used by SecurityGuard
 * role-check step. A regression here silently breaks RBAC without a 403.
 */
import { describe, expect, it } from "vitest";

import { ROLE_RANK } from "@/common/types/auth.types";

describe("ROLE_RANK ordering", () => {
  it("user rank < admin rank", () => {
    expect(ROLE_RANK["user"]).toBeLessThan(ROLE_RANK["admin"]);
  });

  it("admin rank < super_admin rank", () => {
    expect(ROLE_RANK["admin"]).toBeLessThan(ROLE_RANK["super_admin"]);
  });

  it("user rank < super_admin rank (transitive)", () => {
    expect(ROLE_RANK["user"]).toBeLessThan(ROLE_RANK["super_admin"]);
  });

  it("all ranks are positive integers", () => {
    for (const rank of Object.values(ROLE_RANK)) {
      expect(rank).toBeGreaterThan(0);
      expect(Number.isInteger(rank)).toBe(true);
    }
  });

  it("covers exactly three roles", () => {
    expect(Object.keys(ROLE_RANK)).toHaveLength(3);
    expect(Object.keys(ROLE_RANK)).toEqual(
      expect.arrayContaining(["user", "admin", "super_admin"]),
    );
  });

  it("minRole=admin blocks user (rank check mirrors SecurityGuard.checkRole)", () => {
    // SecurityGuard: if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) → 403
    const userRank = ROLE_RANK["user"];
    const minRank = ROLE_RANK["admin"];
    expect(userRank).toBeLessThan(minRank); // would throw 403
  });

  it("minRole=user allows admin (admin rank >= user rank)", () => {
    expect(ROLE_RANK["admin"]).toBeGreaterThanOrEqual(ROLE_RANK["user"]);
  });

  it("minRole=super_admin blocks admin", () => {
    expect(ROLE_RANK["admin"]).toBeLessThan(ROLE_RANK["super_admin"]);
  });

  it("super_admin satisfies any minRole", () => {
    for (const role of ["user", "admin", "super_admin"] as const) {
      expect(ROLE_RANK["super_admin"]).toBeGreaterThanOrEqual(ROLE_RANK[role]);
    }
  });
});
