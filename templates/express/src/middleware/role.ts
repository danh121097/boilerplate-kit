import { AppError } from "@/types";
import { ROLES, Role } from "@/types/auth";
import { NextFunction, Request, Response } from "express";

/**
 * Role hierarchy (higher number = more authority): super_admin > admin > user.
 * A role implicitly satisfies any requirement at or below its rank, so a
 * higher role never needs to be listed explicitly on a route.
 */
const ROLE_RANK: Record<Role, number> = {
  [ROLES.USER]: 1,
  [ROLES.ADMIN]: 2,
  [ROLES.SUPER_ADMIN]: 3,
};

/**
 * Restrict access to the given role(s) or any higher-ranked role.
 * Must be used AFTER the authenticate middleware.
 * `authorize('admin')` allows admin and super_admin; `authorize('user')` allows
 * everyone authenticated.
 */
export function authorize(...allowedRoles: Role[]) {
  // The least-privileged allowed role sets the bar; anyone at or above passes.
  const requiredRank = Math.min(...allowedRoles.map((r) => ROLE_RANK[r]));

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError({
        message: "Authentication required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }
    if (ROLE_RANK[req.user.role] < requiredRank) {
      throw new AppError({
        message: "Insufficient permissions!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
    next();
  };
}
