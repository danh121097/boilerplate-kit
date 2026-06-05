# API Reference

All HTTP endpoints exposed by this template, generated from the route files
(`src/routes/`, `src/modules/*/routes.ts`). No endpoints exist outside this
list.

## Conventions

- **Base path (`apiPrefix`)** — every route mounts under `API_PREFIX`
  (default `/api/v1`, see `src/config/environment.ts`). Paths below show the
  full path including this prefix.
- **HMAC (always)** — `app.use(apiPrefix, verifyHmacRequest)` guards *every*
  route under the prefix. Each request MUST send `sig` and `ctime` headers.
  The signed canonical string is
  `[METHOD, contentType, ctime, path, ""].join("\n")`, HMAC-SHA256, Base64
  (`src/middleware/hmac.ts`, `src/utils/hmac.ts`). `ctime` must be within 5
  minutes of server time (replay protection).
- **Global rate limit (always)** — `globalRateLimiter` (100 req / 60s) is
  applied under the prefix on top of HMAC. Skipped in test mode. Auth routes
  layer stricter limiters on top.
- **`authenticate`** — verifies a JWT access token from `Authorization:
  Bearer <token>` or the `accessToken` cookie; also enforces token revocation
  (`src/middleware/auth.ts`).
- **`authorize(role)`** — role-rank check, runs after `authenticate`
  (`src/middleware/role.ts`).
- **Auth cookies** — register / login / refresh set `accessToken` and
  `refreshToken` as httpOnly cookies; logout clears them.

## Endpoints

| Method | Path | Auth / Guards | Request body (Zod) | Response shape |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/health` | HMAC, global rate-limit | — | `{ status: "ok", timestamp, uptime, database, redis }` |
| POST | `/api/v1/auth/register` | HMAC, `authRateLimiter` (20/15m), `validate(registerSchema)` | `{ email: string (email), password: string (min 8), name: string (min 1) }` | `201` `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies |
| POST | `/api/v1/auth/login` | HMAC, `loginRateLimiter` (10/15m), `validate(loginSchema)` | `{ email: string (email), password: string (min 1) }` | `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies |
| POST | `/api/v1/auth/refresh` | HMAC, `authRateLimiter` (20/15m) | — (refresh token read from `refreshToken` cookie) | `{ success: true, message, data: { tokens: { accessToken, refreshToken } } }` + rotated cookies. `401` if cookie missing/invalid |
| POST | `/api/v1/auth/logout` | HMAC, `authRateLimiter` (20/15m) | — (refresh token read from `refreshToken` cookie) | `{ success: true, message }` + cleared cookies |
| GET | `/api/v1/auth/me` | HMAC, `authenticate` | — | `{ success: true, data: { user } }` |
| GET | `/api/v1/users` | HMAC, `authenticate`, `authorize('admin')` | — | `{ status: "success", data: User[] }` (passwords stripped). `403` if not admin/super_admin |
| GET | `/api/v1/users/:id` | HMAC, `authenticate` | — | `{ status: "success", data: User }` (password stripped). `404` if not found |

## Error shape

Errors thrown as `AppError` are normalized by the global error handler
(`src/middleware/error-handler.ts`) to:

```json
{ "success": false, "status": <code>, "message": <string>, "error_code": <string>, "error_message": <string> }
```

Common codes: `400 VALIDATION_ERROR`, `401 AUTHENTICATION_ERROR`,
`403 AUTHORIZATION_ERROR`, `404 NOT_FOUND`, `409 CONFLICT`.

Unmatched routes under any path fall through to `notFoundHandler`
(`src/middleware/not-found-handler.ts`).

## Notes

- `tokens` are also returned in the JSON body for non-browser clients;
  browsers can rely on the httpOnly cookies.
- Refresh uses rotation: the old refresh token is revoked and a new pair
  issued on every `/auth/refresh` (`src/modules/auth/service.ts`).
