import { AppError } from "@/types";
import { ROLE_RANK, Role } from "@/types/auth";
import { NextFunction, Request, Response } from "express";

/**
 * Require AT LEAST the given role — that role or any higher-ranked one passes.
 * Must be used AFTER the authenticate middleware.
 * `requireMinRole('admin')` allows admin and super_admin; `requireMinRole('user')`
 * allows everyone authenticated. The threshold semantics are explicit in the name
 * (min role), so a single role is all you ever pass.
 */
export function requireMinRole(minRole: Role) {
  const requiredRank = ROLE_RANK[minRole];

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
