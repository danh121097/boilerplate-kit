import { authenticate } from "@/middleware/auth";
import { authorize } from "@/middleware/role";
import type { RouteGroup } from "@/types/routing";
import * as UserController from "./controller";

const userGroup: RouteGroup = {
  prefix: "/users",
  routes: [
    /** GET /users — list all users (admin only) */
    {
      method: "get",
      path: "/",
      middleware: [authenticate, authorize("admin")],
      handler: UserController.listUsers,
    },
    /** GET /users/:id — get user by ID (any authenticated user) */
    {
      method: "get",
      path: "/:id",
      middleware: [authenticate, authorize("admin")],
      handler: UserController.getUserById,
    },
  ],
};

export default userGroup;
