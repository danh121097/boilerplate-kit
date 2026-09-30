import { authenticate } from "@/middleware/auth";
import { requireMinRole } from "@/middleware/role";
import { ROLES } from "@/types/auth";
import { z } from "zod";
import type { RouteGroup } from "@/types/routing";
import * as UserController from "@/modules/user/controller";

const publicUserSchema = z.object({
  _id: z.string(),
  email: z.email(),
  name: z.string(),
  role: z.enum([ROLES.USER, ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
const listUsersResponseSchema = z.object({
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
const getUserResponseSchema = z.object({
  status: z.literal("success"),
  data: publicUserSchema,
});

const userGroup: RouteGroup = {
  prefix: "/users",
  routes: [
    /** GET /users — list all users (admin and above) */
    {
      method: "get",
      path: "/",
      documentation: {
        summary: "List users",
        tags: ["users"],
        bearerAuth: true,
        parameters: [
          {
            name: "page",
            in: "query",
            description: "Page number; values below 1 are treated as 1.",
            schema: { type: "integer", default: 1, minimum: 1 },
          },
          {
            name: "limit",
            in: "query",
            description: "Items per page; values are clamped to 1–100.",
            schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          "200": "Paginated users without password hashes",
          "401": "A valid access token is required",
          "403": "Admin role is required",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": listUsersResponseSchema },
      },
      middleware: [authenticate, requireMinRole("admin")],
      handler: UserController.listUsers,
    },
    /** GET /users/:id — get user by ID (admin and above) */
    {
      method: "get",
      path: "/:id",
      documentation: {
        summary: "Get a user by ID",
        tags: ["users"],
        bearerAuth: true,
        parameters: [
          {
            name: "id",
            in: "path",
            description: "24-character hexadecimal MongoDB user ID.",
            required: true,
            schema: { type: "string", pattern: "^[\\da-f]{24}$" },
          },
        ],
        responses: {
          "200": "User without a password hash",
          "401": "A valid access token is required",
          "403": "Admin role is required",
          "404": "User not found",
          "429": "Too many requests",
          "500": "The server could not complete the request",
        },
        responseSchemas: { "200": getUserResponseSchema },
      },
      middleware: [authenticate, requireMinRole("admin")],
      handler: UserController.getUserById,
    },
  ],
};

export default userGroup;
