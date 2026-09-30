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
import { authenticate } from "@/plugins/security";
import type { FastifyPluginAsync } from "fastify";
import * as AuthController from "@/modules/auth/controller";

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post(
    "/register",
    {
      config: { rateLimit: { max: 30, timeWindow: 15 * 60_000, groupId: "auth" } },
      schema: {
        tags: ["auth"],
        summary: "Register a user",
        body: registerSchema,
        response: { 201: registerResponseSchema },
      },
    },
    AuthController.register,
  );
  fastify.post(
    "/login",
    {
      config: { rateLimit: { max: 30, timeWindow: 15 * 60_000, groupId: "login" } },
      schema: {
        tags: ["auth"],
        summary: "Log in and create a session",
        body: loginSchema,
        response: { 200: loginResponseSchema },
      },
    },
    AuthController.login,
  );
  fastify.post(
    "/refresh",
    {
      config: { rateLimit: { max: 30, timeWindow: 15 * 60_000, groupId: "auth" } },
      schema: {
        tags: ["auth"],
        summary: "Rotate refresh and access tokens",
        body: refreshBodySchema,
        response: { 200: refreshResponseSchema },
      },
    },
    AuthController.refresh,
  );
  fastify.post(
    "/logout",
    {
      config: { rateLimit: { max: 30, timeWindow: 15 * 60_000, groupId: "auth" } },
      schema: {
        tags: ["auth"],
        summary: "Revoke the current session",
        body: refreshBodySchema,
        response: { 200: logoutResponseSchema },
      },
    },
    AuthController.logout,
  );
  fastify.get(
    "/me",
    {
      preHandler: [authenticate],
      schema: {
        tags: ["auth"],
        summary: "Get the current user",
        security: [{ bearerAuth: [] }],
        response: { 200: meResponseSchema },
      },
    },
    AuthController.getMe,
  );
};

export default authRoutes;
