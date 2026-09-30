import "fastify";

declare module "fastify" {
  interface FastifySchema {
    /** OpenAPI response descriptions by status code; merged by the Swagger transform. */
    /** Body may be omitted (e.g. a cookie carries the value); documented as not required. */
    docsBodyOptional?: boolean;
    docsResponses?: Record<string, string>;
  }
}
