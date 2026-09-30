import { AppError } from "@/types";
import { ROLE_RANK } from "@/types/auth";
import type { Role } from "@/types/auth";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Enforce a minimum role rank after authenticate has populated request.user. */
export function requireMinRole(minRole: Role) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new AppError({
        message: "Authentication required!",
        statusCode: 401,
        errorType: "AUTHENTICATION_ERROR",
      });
    }
    if (ROLE_RANK[request.user.role] < ROLE_RANK[minRole]) {
      throw new AppError({
        message: "Insufficient permissions!",
        statusCode: 403,
        errorType: "AUTHORIZATION_ERROR",
      });
    }
  };
}
