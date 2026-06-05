import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** HTTP verbs supported by the declarative route config */
export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** A single route declared as data instead of an imperative call */
export interface RouteConfig {
  method: HttpMethod;
  /** Path relative to the owning group's prefix (e.g. '/login', '/:id') */
  path: string;
  /** Middleware chain run before the handler; defaults to none */
  middleware?: RequestHandler[];
  handler: RequestHandler;
  /**
   * Optional Zod schema describing the request body. Not used at runtime — the
   * `validate()` middleware still enforces it — but lets tooling (e.g. the
   * Postman collection generator) derive a body example straight from the route.
   */
  bodySchema?: ZodType;
}

/** A set of routes sharing a common path prefix (e.g. '/auth') */
export interface RouteGroup {
  prefix: string;
  routes: RouteConfig[];
}
