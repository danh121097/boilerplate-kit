# Modules and Routes

Fastify route plugins are the boundary between HTTP and feature logic.

## Feature layout

A feature under src/modules/<name>/ may contain:

| File          | Responsibility                                                         |
| ------------- | ---------------------------------------------------------------------- |
| routes.ts     | Fastify routes, Zod request/response schemas, Swagger metadata, guards |
| controller.ts | Read FastifyRequest, call services, set cookies, send response         |
| service.ts    | Business rules and Mongoose operations; throws AppError                |
| validation.ts | Zod input/response schemas and inferred body types                     |

The health feature is small and only needs routes.ts. Auth and user features
separate the HTTP layer, services, and schemas. Auth splits further:
service.ts holds register, login, and getMe and re-exports the session API from
refresh-session.ts (issueTokens, refresh, logout, REFRESH_REUSE_GRACE_MS). The
user module's serialize-user.ts is the allowlist every controller uses to turn a
user document into the public response shape.

## Registration

src/routes/index.ts registers the health plugin at the API root, auth routes
under /auth, and user routes under /users. That route tree is mounted beneath
API_PREFIX (default /api/v1). A Fastify plugin owns route definitions and
Fastify's plugin encapsulation determines hook/decorator visibility.

Routes use Fastify methods directly. For example, auth/routes.ts registers
POST /register with a body schema, response schema, rate-limit config, and
AuthController.register handler. No RouteGroup or custom route registrar is
used. The same schema drives runtime validation, response serialization, and
OpenAPI generation.

## Request lifecycle

Root HMAC and optional CSRF hooks run before the API route handlers. Per-route
preHandler hooks run authenticate (src/plugins/auth.ts) and then requireMinRole
(src/plugins/role.ts) for admin routes.
Controllers handle HTTP details; services do not depend on Fastify request or
reply objects.

## Adding a feature

1. Add a module under src/modules/<name>/ with the files it needs.
2. Add a FastifyPluginAsync route plugin with schemas and route handlers.
3. Register the plugin in src/routes/index.ts at its intended prefix.
4. Document new routes in docs/api-reference.md.

## Current routes

All paths below are relative to API_PREFIX and require HMAC.

| Method | Path           | Route-level access                                           |
| ------ | -------------- | ------------------------------------------------------------ |
| GET    | /health        | Public                                                       |
| POST   | /auth/register | Public                                                       |
| POST   | /auth/login    | Public                                                       |
| POST   | /auth/refresh  | Refresh token in body or cookie (body optional)              |
| POST   | /auth/logout   | Public; revokes the presented session family (body optional) |
| GET    | /auth/me       | Authenticated user                                           |
| GET    | /users         | Admin or super_admin                                         |
| GET    | /users/:id     | Admin or super_admin                                         |
