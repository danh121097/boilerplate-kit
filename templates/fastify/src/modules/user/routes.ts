import { publicUserSchema } from "@/modules/auth/validation";
import { authenticate } from "@/plugins/auth";
import { requireMinRole } from "@/plugins/role";
import { z } from "zod";
import type { FastifyPluginAsync } from "fastify";
import * as UserController from "@/modules/user/controller";

interface UserListQuery {
  page?: string;
  limit?: string;
}

interface UserIdParams {
  id: string;
}

const userRoutes: FastifyPluginAsync = async (fastify) => {
  const querySchema = z.object({ page: z.string().optional(), limit: z.string().optional() });
  const paramsSchema = z.object({
    id: z.string().regex(/^[\da-f]{24}$/i, "Invalid value for _id!"),
  });
  const listResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(publicUserSchema),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  });
  const getResponseSchema = z.object({ success: z.literal(true), data: publicUserSchema });

  fastify.get<{ Querystring: UserListQuery }>(
    "/",
    {
      preHandler: [authenticate, requireMinRole("admin")],
      schema: {
        tags: ["users"],
        summary: "List users",
        docsResponses: {
          "200": "Paginated users without password hashes",
          "401": "A valid access token is required",
          "403": "Admin role is required",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        security: [{ bearerAuth: [] }],
        querystring: querySchema,
        response: { 200: listResponseSchema },
      },
    },
    UserController.listUsers,
  );
  fastify.get<{ Params: UserIdParams }>(
    "/:id",
    {
      // preValidation: auth and role win over params validation, but run after the global
      // rate limiter's onRequest hook so rejected anonymous requests still count.
      preValidation: [authenticate, requireMinRole("admin")],
      schema: {
        tags: ["users"],
        summary: "Get a user by ID",
        docsResponses: {
          "200": "User without a password hash",
          "401": "A valid access token is required",
          "403": "Admin role is required",
          "404": "User not found",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        security: [{ bearerAuth: [] }],
        params: paramsSchema,
        response: { 200: getResponseSchema },
      },
    },
    UserController.getUserById,
  );
};

export default userRoutes;
