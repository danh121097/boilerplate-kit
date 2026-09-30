# Request Flow

Source: [src/app.ts](../../src/app.ts), [src/routes/index.ts](../../src/routes/index.ts),
and the feature route plugins under [src/modules/](../../src/modules/).

## App registration order

buildApp() configures the Fastify instance in this order:

1. Fastify logger, body limit, and proxy trust.
2. Validator and serializer compilers for Zod.
3. Cookie, CORS, helmet, and compression plugins.
4. Swagger and Swagger UI at /docs and /docs/json.
5. Shared error and not-found handlers.
6. Root onRequest hooks for HMAC and optional CSRF.
7. Global rate limiting, plus the shared auth and separate login buckets.
8. Health, auth, and user route plugins under API_PREFIX.
9. Socket.IO attached directly to app.server; app.close() closes it.

Fastify routes and hooks are scoped by plugin encapsulation. The security hooks
are installed on the root instance before the API plugin is registered, so
they apply to its child route plugins. Swagger routes are outside API_PREFIX
and do not require HMAC.

## Route plugins

src/routes/index.ts mounts health routes, auth routes at /auth, and user routes
at /users beneath the configured API_PREFIX. Each feature's routes.ts
registers ordinary Fastify methods and holds the Zod input/response schemas and
Swagger metadata alongside the handler. There is no custom router generator.

## Request lifecycle

For an API request, the root HMAC hook checks sig and ctime before route
handling. The optional CSRF hook then checks Origin or Referer for mutating
methods. Fastify parses JSON and cookies; rate-limit hooks run before the
controller. Route validation uses the Zod schemas; protected handlers run
authenticate and, for admin routes, requireMinRole.

## Controller and service boundaries

- Controllers read FastifyRequest, call the service, set cookies when needed,
  and shape the response with FastifyReply.
- Services own application rules and Mongoose access. They throw AppError for
  expected failures and do not depend on request/reply objects.
- Zod route schemas validate inputs, transform normalized email, describe
  responses, and generate OpenAPI.

For example, login checks the HMAC and rate limit, validates the body, calls
AuthService.login(), sets the httpOnly access and refresh cookies, then returns
the user and token pair. Rejected handlers flow to the global error handler.

## See also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md)
- [error-handling.md](./error-handling.md)
- [security-rate-limit.md](./security-rate-limit.md)
