import { publicUserSchema } from "@/docs/schemas";
import { authenticate } from "@/middleware/auth";
import { authRateLimiter, loginRateLimiter } from "@/middleware/rate-limit";
import {
  loginSchema,
  refreshBodySchema,
  registerSchema,
  validate,
} from "@/modules/auth/validation";
import { z } from "zod";
import type { RouteGroup } from "@/types/routing";
import * as AuthController from "@/modules/auth/controller";

// Both fields are omitted from the body when AUTH_TOKENS_IN_BODY=false (cookies still carry them).
const tokensSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
});
const registerResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ user: publicUserSchema, tokens: tokensSchema }),
});
const refreshResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({ tokens: tokensSchema }),
});
const logoutResponseSchema = z.object({ success: z.literal(true), message: z.string() });
const meResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ user: publicUserSchema }),
});

const authGroup: RouteGroup = {
  prefix: "/auth",
  routes: [
    {
      method: "post",
      path: "/register",
      documentation: {
        summary: "Register a user",
        tags: ["auth"],
        responses: {
          "201": "User registered successfully",
          "400": "The request body is invalid",
          "409": "An account with this email already exists",
          "429": "Too many registration attempts",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "201": registerResponseSchema },
      },
      bodySchema: registerSchema,
      middleware: [authRateLimiter, validate(registerSchema)],
      handler: AuthController.register,
    },
    {
      method: "post",
      path: "/login",
      documentation: {
        summary: "Log in and create a session",
        tags: ["auth"],
        responses: {
          "200": "Login successful",
          "400": "The request body is invalid",
          "401": "The email or password is invalid",
          "429": "Too many login attempts",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": registerResponseSchema },
      },
      bodySchema: loginSchema,
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login,
    },
    {
      method: "post",
      path: "/refresh",
      documentation: {
        summary: "Rotate refresh and access tokens",
        description: "Provide a refresh token in the body or use the refresh-token cookie.",
        requestBodyDescription: "Optional when the refresh-token cookie is present.",
        tags: ["auth"],
        responses: {
          "200": "Tokens refreshed successfully",
          "400": "The request body is invalid",
          "401": "The refresh token is missing, invalid, expired, or reused",
          "429": "Too many refresh attempts",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": refreshResponseSchema },
      },
      bodySchema: refreshBodySchema,
      bodyRequired: false,
      middleware: [authRateLimiter, validate(refreshBodySchema)],
      handler: AuthController.refresh,
    },
    {
      method: "post",
      path: "/logout",
      documentation: {
        summary: "Revoke the current session",
        description: "Provide a refresh token in the body or use the refresh-token cookie.",
        requestBodyDescription: "Optional when the refresh-token cookie is present.",
        tags: ["auth"],
        responses: {
          "200": "Session revoked and authentication cookies cleared",
          "400": "The request body is invalid",
          "429": "Too many logout attempts",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": logoutResponseSchema },
      },
      bodySchema: refreshBodySchema,
      bodyRequired: false,
      middleware: [authRateLimiter, validate(refreshBodySchema)],
      handler: AuthController.logout,
    },
    {
      method: "get",
      path: "/me",
      documentation: {
        summary: "Get the current user",
        tags: ["auth"],
        bearerAuth: true,
        responses: {
          "200": "Current user profile",
          "401": "A valid access token is required",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": meResponseSchema },
      },
      middleware: [authenticate],
      handler: AuthController.getMe,
    },
  ],
};

export default authGroup;
