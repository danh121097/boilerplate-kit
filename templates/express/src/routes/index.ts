import { registerGroup } from "@/utils/route-registrar";
import { Router } from "express";
import type { RouteGroup } from "@/types/routing";
import healthGroup from "./health-check";
import authGroup from "@/modules/auth/routes";
import userGroup from "@/modules/user/routes";

// Order preserved (health → auth → user) to keep route precedence identical.
// Exported so tooling (e.g. Postman collection generator) reuses the exact same
// registry — adding a module here is the only place a new route group is declared.
export const groups: RouteGroup[] = [healthGroup, authGroup, userGroup];

const router: Router = Router();

for (const group of groups) {
  router.use(group.prefix, registerGroup(group));
}

export default router;
