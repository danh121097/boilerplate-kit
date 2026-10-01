# API Reference

All HTTP endpoints exposed by this template, generated from the route files
(`src/routes/`, `src/modules/*/routes.ts`). No endpoints exist outside this
list.

The OpenAPI document is generated from the same route registry, request Zod
schemas, and response schemas.

OpenAPI JSON is served at `/docs/json` and Swagger UI at `/docs`. In
development, Swagger UI signs "Try it out" requests automatically, so only a
Bearer token is needed for protected routes. The server still enforces HMAC,
and the HMAC secret is served to Swagger only in development. Docs are on
outside production and off in production unless `DOCS_ENABLED=true`;
`DOCS_ENABLED=false` hides them everywhere. `NODE_ENV` defaults to
`development` when unset, so always set `NODE_ENV=production` on deploys.

## Conventions

- **Base path (`apiPrefix`)** — every route mounts under `API_PREFIX`
  (default `/api/v1`, see `src/config/environment.ts`). Paths below show the
  full path including this prefix.
- **HMAC (always)** — `app.use(apiPrefix, verifyHmacRequest)` guards _every_
  route under the prefix. Each request MUST send `sig` and `ctime` headers.
  The signed canonical string is
  `[METHOD, contentType, ctime, path, ""].join("\n")`, HMAC-SHA256, Base64
  (`src/middleware/hmac.ts`, `src/utils/hmac.ts`). `ctime` must be within 5
  minutes of server time (bounds the replay window; no nonce, no body hash).
  A failure is `401` with `errorType: "HMAC_ERROR"`, never `AUTHENTICATION_ERROR`
  (clients must not treat it as a dead session; clock skew causes it too). HMAC is
  an anti-abuse layer, not a security boundary: a secret shipped to a browser or
  app is public.
- **CSRF guard (`ENABLE_CSRF=true`, default off)** — mutating methods need an
  `Origin` (or `Referer` origin) in `corsOrigins`, else `403 AUTHORIZATION_ERROR`.
  A request with none of `Cookie`, `Origin`, `Referer` (native apps, server-to-server)
  is exempt: with no ambient credentials there is nothing for a forged request to
  ride on, and browsers always send `Origin` on cross-site writes.
- **Global rate limit (always)** — `globalRateLimiter` (100 req / 60s per client
  IP) is applied under the prefix after HMAC and the origin guard, so it counts
  every request that passes them: all routes (auth included), bad-JWT requests,
  validation failures and signed unknown paths (404). HMAC- or origin-rejected
  requests and unparseable bodies are not counted. Skipped in test mode. Auth
  routes layer stricter limiters on top: `register`, `refresh` and `logout` share
  one bucket (30 / 15 min); `login` has its own (30 / 15 min).
- **`authenticate`** — verifies a JWT access token from `Authorization:
Bearer <token>` or the `accessToken` cookie; also enforces token revocation
  (`src/middleware/auth.ts`).
- **`requireMinRole(role)`** — role-rank check, runs after `authenticate`
  (`src/middleware/role.ts`).
- **Auth cookies** — register / login / refresh set `accessToken` and
  `refreshToken` as httpOnly cookies; logout clears them, and so does a refused
  refresh (today always `401`; a future `403` clears too; `5xx`/`429` do not).
  Cookie `maxAge` follows `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` (defaults
  `15m` / `7d`).
- **Tokens in the body** — register / login / refresh also return both tokens in
  the JSON body (by design: token-mode clients need them). Cookie-mode web clients
  therefore expose the refresh token to script on the page (accepted risk).
- **Behind a proxy** — set `TRUST_PROXY` (a hop count, `true`, or a
  comma-separated IP/subnet list) so `req.ip` and rate limits use the client
  address; unset trusts no proxy. Prefer a hop count (e.g. `1`) over `true`,
  which trusts every `X-Forwarded-For` entry and lets clients spoof their IP.
  Token expiries must be `<positive int><s|m|h|d>`; anything else fails boot.

## Endpoints

| Method | Path                    | Auth / Guards                                                | Request body (Zod)                                                                                                                               | Response shape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/health`        | HMAC, global rate-limit                                      | —                                                                                                                                                | `{ status: "ok", timestamp, uptime, database, redis }`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| POST   | `/api/v1/auth/register` | HMAC, `authRateLimiter` (30/15m), `validate(registerSchema)` | `{ email: string (email), password: string (min 8), name: string (min 1) }`                                                                      | `201` `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies                                                                                                                                                                                                                                                                                                                                                                                      |
| POST   | `/api/v1/auth/login`    | HMAC, `loginRateLimiter` (30/15m), `validate(loginSchema)`   | `{ email: string (email), password: string (min 1) }`                                                                                            | `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies                                                                                                                                                                                                                                                                                                                                                                                            |
| POST   | `/api/v1/auth/refresh`  | HMAC, `authRateLimiter` (30/15m)                             | optional `{ refreshToken?: string }` (falls back to the `refreshToken` cookie when absent or `""`; a non-string value is `400 VALIDATION_ERROR`) | `{ success: true, message, data: { tokens: { accessToken, refreshToken } } }` + rotated cookies. A token rotated within the last 10s (retry / parallel tabs) is answered like a normal refresh with a fresh pair. `401 AUTHENTICATION_ERROR` if the token is missing/invalid/expired/reused after that window (reuse of a rotated token revokes every session of the user and disconnects their sockets), with both token cookies cleared (`Set-Cookie` expired, `refreshToken` on its auth path) |
| POST   | `/api/v1/auth/logout`   | HMAC, `authRateLimiter` (30/15m)                             | optional `{ refreshToken?: string }` (same body/cookie rules as refresh)                                                                         | `{ success: true, message }` + cleared cookies. Deletes the token's family (replaying it is a plain `401`; other devices' refresh tokens survive), cuts off the user's access tokens (Redis on) and disconnects their sockets                                                                                                                                                                                                                                                                     |
| GET    | `/api/v1/auth/me`       | HMAC, `authenticate`                                         | —                                                                                                                                                | `{ success: true, data: { user } }`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GET    | `/api/v1/users`         | HMAC, `authenticate`, `requireMinRole('admin')`              | — (query: `page`≥1 def 1, `limit` 1–100 def 20)                                                                                                  | `{ success: true, data: PublicUser[], meta: OffsetMeta }`. `403` if below admin                                                                                                                                                                                                                                                                                                                                                                                                                   |
| GET    | `/api/v1/users/:id`     | HMAC, `authenticate`, `requireMinRole('admin')`              | —                                                                                                                                                | `{ success: true, data: PublicUser }`. `403` if below admin, `404` if not found                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Error shape

Errors thrown as `AppError` are normalized by the global error handler
(`src/middleware/error-handler.ts`) to:

```json
{ "success": false, "status": "error", "errorType": <string>, "message": <string>, "error_code": <number>, "error_message": <string> }
```

Common codes: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_ERROR`,
`401 HMAC_ERROR` (missing/invalid/stale HMAC headers), `403 AUTHORIZATION_ERROR`,
`404 NOT_FOUND`, `409 CONFLICT`, `413 VALIDATION_ERROR` ("Request body is too
large!"), `429 RATE_LIMIT` (every rate-limit response uses this envelope).

A body that is not valid JSON is `400 VALIDATION_ERROR` ("Malformed JSON request
body!"). Express parses the body before the HMAC check, so an unsigned request with
a malformed or oversize body gets `400`/`413`; Fastify answers `401` for the same
request. The body is not signed, so the order has no security impact.

`stack` is added to the body only when `NODE_ENV=development` and the status is
`>= 500`.

Unmatched routes fall through to `notFoundHandler`
(`src/middleware/not-found-handler.ts`). Under `apiPrefix` an unsigned unknown path
is `401 HMAC_ERROR` first; outside it (for example `/foo`) there is no HMAC gate.

## Pagination

List endpoints use the reusable helpers in `src/utils/pagination.ts`. Two equal
strategies — pick per list; both keep the `{ success, data }` envelope and add a
sibling `meta`.

### Offset (`?page&limit`) — used by `GET /users`

`page` ≥ 1 (default 1), `limit` 1–100 (default 20). Out-of-range / non-numeric
values are clamped, never rejected.

```jsonc
// GET /api/v1/users?page=2&limit=20
{
  "success": true,
  "data": [
    /* PublicUser[] */
  ],
  "meta": {
    "page": 2,
    "limit": 20,
    "total": 137,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": true,
  },
}
```

```ts
const { page, limit, skip } = parseOffsetPagination(req.query);
const [rows, total] = await Promise.all([
  Model.find().sort({ _id: -1 }).skip(skip).limit(limit),
  Model.countDocuments(),
]);
res.json({ success: true, data: rows, meta: buildOffsetMeta(total, page, limit) });
```

### Cursor (`?cursor&limit`) — keyset alternative for feed-style lists

Stable under inserts and fast at scale (no deep `skip`), but no jump-to-page and
no total. **Valid only for `_id`-sorted lists** (monotonic ObjectId). An invalid
`cursor` is treated as the first page. Drop it into any list that needs it:

```ts
import { Types } from "mongoose";

const { cursor, limit } = parseCursorPagination(req.query); // cursor: validated id string
// Build the ObjectId explicitly so the $lt range compares ids, not strings.
const filter = cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {}; // $lt pairs with sort _id:-1
const rows = await Model.find(filter)
  .sort({ _id: -1 })
  .limit(limit + 1); // +1 detects hasNext
const { items, meta } = buildCursorMeta(rows, limit);
res.json({ success: true, data: items, meta }); // meta: { limit, nextCursor, hasNext }
```

## Notes

- `user` / `PublicUser` in responses is the allowlisted shape from
  `serializeUser` (`src/modules/user/serialize-user.ts`): `_id`, `email`, `name`,
  `role`, `isActive`, `createdAt`, `updatedAt` (ISO strings). No password hash,
  no `__v`.
- Success envelope is `{ success: true, message?, data, meta? }`; the health
  route keeps `{ status: "ok", ... }`.

- `tokens` are also returned in the JSON body for token-mode clients; browsers can
  rely on the httpOnly cookies.
- Refresh uses rotation: the old refresh token is revoked and a new pair
  issued on every `/auth/refresh` (`src/modules/auth/refresh-session.ts`).
