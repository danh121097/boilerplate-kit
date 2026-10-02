import {
  loginResponseSchema,
  loginSchema,
  logoutResponseSchema,
  meResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerResponseSchema,
  registerSchema,
} from "@/modules/auth/validation";
import { authenticate } from "@/plugins/auth";
import { authRateLimitOptions, loginRateLimitOptions } from "@/plugins/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import rateLimit from "@fastify/rate-limit";
import * as AuthController from "@/modules/auth/controller";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // One encapsulated scope per limiter: a scope owns a single rate-limit store, so
  // its routes share one counter (a per-route `config.rateLimit` would not).
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, authRateLimitOptions());
    scope.post(
      "/register",
      {
        schema: {
          tags: ["auth"],
          summary: "Register a user",
          docsResponses: {
            "201": "User registered successfully",
            "400": "The request body is invalid",
            "409": "An account with this email already exists",
            "429": "Too many registration attempts",
            "500": "The server could not complete the request",
          },
          body: registerSchema,
          response: { 201: registerResponseSchema },
        },
      },
      AuthController.register,
    );
    scope.post(
      "/refresh",
      {
        schema: {
          tags: ["auth"],
          summary: "Rotate refresh and access tokens",
          docsResponses: {
            "200": "Tokens refreshed successfully",
            "400": "The request body is invalid",
            "401": "The refresh token is missing, invalid, expired, or reused",
            "429": "Too many refresh attempts",
            "500": "The server could not complete the request",
          },
          docsBodyOptional: true,
          body: refreshBodySchema,
          response: { 200: refreshResponseSchema },
        },
      },
      AuthController.refresh,
    );
    scope.post(
      "/logout",
      {
        schema: {
          tags: ["auth"],
          summary: "Revoke the current session",
          docsResponses: {
            "200": "Session revoked and authentication cookies cleared",
            "400": "The request body is invalid",
            "429": "Too many logout attempts",
            "500": "The server could not complete the request",
          },
          docsBodyOptional: true,
          body: refreshBodySchema,
          response: { 200: logoutResponseSchema },
        },
      },
      AuthController.logout,
    );
  });
  await fastify.register(async (scope) => {
    await scope.register(rateLimit, loginRateLimitOptions());
    scope.post(
      "/login",
      {
        schema: {
          tags: ["auth"],
          summary: "Log in and create a session",
          docsResponses: {
            "200": "Login successful",
            "400": "The request body is invalid",
            "401": "The email or password is invalid",
            "429": "Too many login attempts",
            "500": "The server could not complete the request",
          },
          body: loginSchema,
          response: { 200: loginResponseSchema },
        },
      },
      AuthController.login,
    );
  });
  fastify.get(
    "/me",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["auth"],
        summary: "Get the current user",
        docsResponses: {
          "200": "Current user profile",
          "401": "A valid access token is required",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    },
    AuthController.getMe,
  );
};

export default authRoutes;
