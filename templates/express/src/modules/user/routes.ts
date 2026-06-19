import { authenticate } from "@/middleware/auth";
import { requireMinRole } from "@/middleware/role";
import type { RouteGroup } from "@/types/routing";
import * as UserController from "@/modules/user/controller";

const userGroup: RouteGroup = {
  prefix: "/users",
  routes: [
    /** GET /users — list all users (admin and above) */
    {
      method: "get",
      path: "/",
      middleware: [authenticate, requireMinRole("admin")],
      handler: UserController.listUsers,
    },
    /** GET /users/:id — get user by ID (admin and above) */
    {
      method: "get",
      path: "/:id",
      middleware: [authenticate, requireMinRole("admin")],
      handler: UserController.getUserById,
    },
  ],
};

export default userGroup;
