import { JwtPayload } from "@/common/types/auth.types";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * JwtAuthGuard (Phase 3) sets request.user after verifying the access token.
 * Usage: `@CurrentUser() user: JwtPayload`
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
