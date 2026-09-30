import type { RequestHandler } from "express";
import type { ZodType } from "zod";

/** HTTP verbs supported by the declarative route config */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface RouteParameter {
  name: string;
  in: "path" | "query";
  description: string;
  required?: boolean;
  schema: {
    type: "integer" | "string";
    default?: number;
    maximum?: number;
    minimum?: number;
    pattern?: string;
  };
}

export interface RouteDocumentation {
  summary: string;
  description?: string;
  tags: string[];
  responses: Record<string, string>;
  responseSchemas?: Record<string, ZodType>;
  parameters?: RouteParameter[];
  bearerAuth?: boolean;
  requestBodyDescription?: string;
}

/** A single route declared as data instead of an imperative call */
export interface RouteConfig {
  method: HttpMethod;
  /** Path relative to the owning group's prefix (e.g. '/login', '/:id') */
  path: string;
  /** OpenAPI metadata kept with the route declaration. */
  documentation: RouteDocumentation;
  /** Middleware chain run before the handler; defaults to none */
  middleware?: RequestHandler[];
  /**
   * Optional Zod schema describing the request body. The OpenAPI document uses
   * its input JSON Schema; the `validate()` middleware still enforces it.
   */
  bodySchema?: ZodType;
  /** Whether the request body is required. Defaults to true when a schema exists. */
  bodyRequired?: boolean;
  handler: RequestHandler;
}

/** A set of routes sharing a common path prefix (e.g. '/auth') */
export interface RouteGroup {
  prefix: string;
  routes: RouteConfig[];
}
