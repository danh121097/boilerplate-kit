# API Reference

HTTP routes are registered in `src/modules/*/routes.ts` and mounted under
`API_PREFIX` (default `/api/v1`). Every request to that prefix needs HMAC
headers, including health and public authentication routes. See
[HMAC verification](./system-architecture/hmac-verification.md).

The OpenAPI document is generated from the route Zod schemas and Swagger
metadata.

OpenAPI JSON is served at `/docs/json` and Swagger UI at `/docs`. In
development, Swagger UI signs "Try it out" requests automatically, so only a
Bearer token is needed for protected routes. The server still enforces HMAC,
and the HMAC secret is served to Swagger only in development. Docs are on
outside production and off in production unless `DOCS_ENABLED=true`;
`DOCS_ENABLED=false` hides them everywhere. `NODE_ENV` defaults to
`development` when unset, so always set `NODE_ENV=production` on deploys.

## Shared rules

- **Rate limits:** 100 requests per minute globally. Per client, register,
  refresh, and logout share one 30-request/15-minute auth bucket; login has a
  separate 30-request/15-minute bucket. Rate-limit responses use the common
  error shape.
- **Access tokens:** send `Authorization: Bearer <token>` or the `accessToken`
  cookie. Protected routes also check Redis revocation state when Redis is on.
- **Refresh cookies:** `accessToken` and `refreshToken` are httpOnly. Refresh
  cookies are scoped to `{API_PREFIX}/auth`; the JSON token pair is also
  returned for non-browser clients.
- **Refresh reuse:** concurrent retries and replays within 10 seconds of a
  rotation receive a new token pair. Reuse after that grace period revokes the
  user's refresh sessions and access tokens.
- **Proxy trust:** `TRUST_PROXY` accepts `true`, `false`, or explicit IP/CIDR
  ranges. Fastify 5.12 does not support hop-count trust.

## Routes

| Method | Path             | Guards                                | Request                                       | Success                                                    |
| ------ | ---------------- | ------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/health`        | HMAC, global rate limit               | —                                             | `200 { status: "ok", timestamp, uptime, database, redis }` |
| POST   | `/auth/register` | HMAC, shared auth bucket, Zod body    | `{ email, password, name }`                   | `201 { success, message, data: { user, tokens } }`         |
| POST   | `/auth/login`    | HMAC, separate login bucket, Zod body | `{ email, password }`                         | `200 { success, message, data: { user, tokens } }`         |
| POST   | `/auth/refresh`  | HMAC, shared auth bucket              | optional `{ refreshToken }` or refresh cookie | `200 { success, message, data: { tokens } }`               |
| POST   | `/auth/logout`   | HMAC, shared auth bucket              | optional `{ refreshToken }` or refresh cookie | `200 { success, message }`, clears cookies                 |
| GET    | `/auth/me`       | HMAC, access token                    | —                                             | `200 { success, data: { user } }`                          |
| GET    | `/users`         | HMAC, access token, admin role        | `page`, `limit` query                         | `200 { status, data: User[], meta }`                       |
| GET    | `/users/:id`     | HMAC, access token, admin role        | 24-character Mongo ID                         | `200 { status, data: User }`                               |

Registration requires a valid email, password of at least 8 characters, and a
non-empty name. Login requires a valid email and non-empty password. Zod
normalizes email to lowercase and trims it. User responses omit password hashes.
Pagination defaults to page 1 and limit 20; limits are capped at 100, and invalid
numeric values are clamped by `src/utils/pagination.ts`.

## Errors

Application and validation errors use the shared envelope:

```json
{
  "success": false,
  "status": "error",
  "errorType": "VALIDATION_ERROR",
  "message": "Request validation failed!",
  "error_code": 400,
  "error_message": "Request validation failed!"
}
```

Common types include `VALIDATION_ERROR`, `AUTHENTICATION_ERROR`,
`AUTHORIZATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMIT`, and
`INTERNAL_ERROR`. Internal 5xx messages are generic outside development.

The successful user-list envelope includes `meta` with `page`, `limit`,
`total`, `totalPages`, `hasNext`, and `hasPrev`.
