import { authenticate } from "@/middleware/auth";
import { authRateLimiter, loginRateLimiter } from "@/middleware/rate-limit";
import {
  loginSchema,
  refreshBodySchema,
  registerSchema,
  validate,
} from "@/modules/auth/validation";
import type { RouteGroup } from "@/types/routing";
import * as AuthController from "@/modules/auth/controller";

const authGroup: RouteGroup = {
  prefix: "/auth",
  routes: [
    {
      method: "post",
      path: "/register",
      bodySchema: registerSchema,
      middleware: [authRateLimiter, validate(registerSchema)],
      handler: AuthController.register,
    },
    {
      method: "post",
      path: "/login",
      bodySchema: loginSchema,
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login,
    },
    {
      method: "post",
      path: "/refresh",
      middleware: [authRateLimiter, validate(refreshBodySchema)],
      handler: AuthController.refresh,
    },
    {
      method: "post",
      path: "/logout",
      middleware: [authRateLimiter, validate(refreshBodySchema)],
      handler: AuthController.logout,
    },
    {
      method: "get",
      path: "/me",
      middleware: [authenticate],
      handler: AuthController.getMe,
    },
  ],
};

export default authGroup;
