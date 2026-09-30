import { publicUserSchema } from "@/modules/auth/validation";
import { authenticate, requireMinRole } from "@/plugins/security";
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
  const paramsSchema = z.object({ id: z.string().regex(/^[\da-f]{24}$/i, "Invalid user ID!") });
  const listResponseSchema = z.object({
    status: z.literal("success"),
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
  const getResponseSchema = z.object({ status: z.literal("success"), data: publicUserSchema });

  fastify.get<{ Querystring: UserListQuery }>(
    "/",
    {
      preHandler: [authenticate, requireMinRole("admin")],
      schema: {
        tags: ["users"],
        summary: "List users",
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
      preHandler: [authenticate, requireMinRole("admin")],
      schema: {
        tags: ["users"],
        summary: "Get a user by ID",
        security: [{ bearerAuth: [] }],
        params: paramsSchema,
        response: { 200: getResponseSchema },
      },
    },
    UserController.getUserById,
  );
};

export default userRoutes;
