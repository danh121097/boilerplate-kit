import { Router } from "express";
import type { RouteGroup } from "@/types/routing";

/**
 * Build an Express Router from a declarative RouteGroup.
 * `method` is a constrained union so router[method] matches Express
 * overloads directly — no casting to any.
 */
export function registerGroup({ routes }: RouteGroup): Router {
  const router = Router();
  for (const { method, path, middleware = [], handler } of routes) {
    router[method](path, ...middleware, handler);
  }
  return router;
}
