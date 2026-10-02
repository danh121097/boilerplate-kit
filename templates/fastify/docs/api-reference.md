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

- **HMAC:** every request under `API_PREFIX` needs `sig` and `ctime`. A missing,
  stale (more than 5 minutes off), or invalid signature is `401` with
  `errorType: "HMAC_ERROR"`, not `AUTHENTICATION_ERROR`; clients must not treat it
  as a dead session. HMAC is an anti-abuse layer (no body hash, no nonce), not a
  security boundary.
- **CSRF (`ENABLE_CSRF=true`, default off):** mutating methods need an `Origin`
  (or `Referer` origin) in `corsOrigins`, else `403 AUTHORIZATION_ERROR`. A request
  with none of `Cookie`, `Origin`, `Referer` (native apps, server-to-server) is
  exempt: with no ambient credentials there is nothing to forge, and browsers
  always send `Origin` on cross-site writes. The Socket.IO handshake and websocket
  upgrade apply the same rule (any method), so a cross-site page cannot open an
  authenticated socket with the user's cookies. The handshake also accepts an `Origin` whose host equals the
  request `Host` header (React Native's own-origin WebSocket), cookies or not. Behind a reverse
  proxy the `Host` header must reach the app unchanged, or that rule rejects React Native
  sockets when `ENABLE_CSRF=true`.
- **Socket handshake errors:** the Socket.IO handshake needs `auth.sig` and `auth.ctime`
  (HMAC over `GET`, `application/json`, `ctime`, `/socket`) and an access token
  (`auth.token` or the `accessToken` cookie). Every rejection is a client `connect_error`
  with `message === "Unauthorized!"`. An HMAC rejection (missing, invalid or expired
  signature or `ctime`) adds `err.data = { errorType: "HMAC_ERROR" }`; a token rejection has
  no `data`. Treat `HMAC_ERROR` as a clock or signing problem, not a dead session.
- **Rate limits:** per client IP, 100 requests per minute globally. Register,
  refresh, and logout share one 30-request/15-minute auth bucket; login has a
  separate 30-request/15-minute bucket (login attempts do not use the auth bucket).
  Auth requests count in both their own bucket and the global cap. All limiters
  run as `onRequest` hooks after the HMAC and CSRF hooks, so they count every
  request that passes those: validation failures, bad-JWT requests, and signed
  requests with a malformed or oversize body. Not counted: HMAC- or CSRF-rejected
  requests and signed unknown paths (the 404 handler is not a counted route).
  Rate-limit responses use the common error shape.
- **Access tokens:** send `Authorization: Bearer <token>` or the `accessToken`
  cookie. Protected routes also check Redis revocation state when Redis is on.
- **Refresh cookies:** `accessToken` and `refreshToken` are httpOnly. Refresh
  cookies are scoped to `{API_PREFIX}/auth`. By default the JSON token pair is also
  returned in the body, because token-mode clients need it; cookie-mode web clients
  then expose the refresh token to script on the page (accepted risk). With
  `AUTH_TOKENS_IN_BODY=false` register, login and refresh return `tokens: {}`
  (`accessToken` and `refreshToken` omitted, cookies unchanged); refresh still
  accepts the token from the body or the cookie. Use it only when every client is
  cookie-based.
- **Refresh reuse:** concurrent retries and replays within 10 seconds of a
  rotation receive a new token pair. Reuse of a rotated token after that grace
  period revokes every refresh token of the user (all devices) and their access
  tokens.
- **Logout:** deletes the presented token's session family. Replaying that token
  is a plain `401` (not reuse); other families keep their refresh tokens. With
  Redis on, the user's access tokens on every device are cut off, so other devices
  get `401` on their next call and recover by refreshing.
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
| GET    | `/users`         | HMAC, access token, admin role        | `page`, `limit` query                         | `200 { success, data: User[], meta }`                      |
| GET    | `/users/:id`     | HMAC, access token, admin role        | 24-character Mongo ID                         | `200 { success, data: User }`                              |

Registration requires a valid email, password of at least 8 characters, and a
non-empty name. Login requires a valid email and non-empty password. Zod
normalizes email to lowercase and trims it. User responses are built by `serializeUser` (`src/modules/user/serialize-user.ts`),
an allowlist of `_id`, `email`, `name`, `role`, `isActive`, `createdAt`, and
`updatedAt` (ISO strings), so password hashes and `__v` never appear.
`/auth/refresh` and `/auth/logout` accept a request with no body at all (cookie-only
clients) as well as `{ "refreshToken": "..." }`; a non-string `refreshToken` is a 400. The body token wins over the cookie when both are sent.
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
`AUTHORIZATION_ERROR`, `HMAC_ERROR` (status `401`), `NOT_FOUND`, `CONFLICT`,
`RATE_LIMIT`, and `INTERNAL_ERROR`. Internal 5xx messages are generic outside
development, and `stack` is added to the body only when `NODE_ENV=development` and
the status is `>= 500`.

A body that is not valid JSON is `400 VALIDATION_ERROR` ("Malformed JSON request
body!") and an oversize one (over 100 KiB) is `413 VALIDATION_ERROR` ("Request body
is too large!"). Other body failures answer with fixed messages and never echo the
parser's text: an unsupported content type, `Content-Encoding` or JSON charset (anything but utf-8) is `415`
("Unsupported request content type!" / "Unsupported request content encoding!" /
"Unsupported request charset!"), and
a corrupt compressed body or a `Content-Length` mismatch is `400` ("Request body
could not be read!"). Fastify checks HMAC before parsing the body, so an **unsigned**
request with a bad or oversize body gets `401 HMAC_ERROR`; Express parses the body
first and answers `400`/`413`. The body is not signed, so the order has no
security impact.

Unmatched routes return `404 NOT_FOUND`. Under `API_PREFIX` an unsigned unknown
path is `401 HMAC_ERROR` first.

Successful responses use `{ success: true, message?, data, meta? }`; `/health` is
the exception and returns `{ status: "ok", ... }` without the envelope. The
successful user-list envelope includes `meta` with `page`, `limit`,
`total`, `totalPages`, `hasNext`, and `hasPrev`.
