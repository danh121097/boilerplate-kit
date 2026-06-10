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
- **`requireMinRole(role)`** — role-rank check, runs after `authenticate`
  (`src/middleware/role.ts`).
- **Auth cookies** — register / login / refresh set `accessToken` and
  `refreshToken` as httpOnly cookies; logout clears them.

## Endpoints

| Method | Path | Auth / Guards | Request body (Zod) | Response shape |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/health` | HMAC, global rate-limit | — | `{ status: "ok", timestamp, uptime, database, redis }` |
| POST | `/api/v1/auth/register` | HMAC, `authRateLimiter` (30/15m), `validate(registerSchema)` | `{ email: string (email), password: string (min 8), name: string (min 1) }` | `201` `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies |
| POST | `/api/v1/auth/login` | HMAC, `loginRateLimiter` (10/15m), `validate(loginSchema)` | `{ email: string (email), password: string (min 1) }` | `{ success: true, message, data: { user, tokens: { accessToken, refreshToken } } }` + httpOnly cookies |
| POST | `/api/v1/auth/refresh` | HMAC, `authRateLimiter` (30/15m) | — (refresh token read from `refreshToken` cookie) | `{ success: true, message, data: { tokens: { accessToken, refreshToken } } }` + rotated cookies. `401` if cookie missing/invalid |
| POST | `/api/v1/auth/logout` | HMAC, `authRateLimiter` (30/15m) | — (refresh token read from `refreshToken` cookie) | `{ success: true, message }` + cleared cookies |
| GET | `/api/v1/auth/me` | HMAC, `authenticate` | — | `{ success: true, data: { user } }` |
| GET | `/api/v1/users` | HMAC, `authenticate`, `requireMinRole('admin')` | — (query: `page`≥1 def 1, `limit` 1–100 def 20) | `{ status: "success", data: User[], meta: OffsetMeta }` (passwords stripped). `403` if below admin |
| GET | `/api/v1/users/:id` | HMAC, `authenticate`, `requireMinRole('admin')` | — | `{ status: "success", data: User }` (password stripped). `404` if not found |

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

## Pagination

List endpoints use the reusable helpers in `src/utils/pagination.ts`. Two equal
strategies — pick per list; both keep the `{ status, data }` envelope and add a
sibling `meta`.

### Offset (`?page&limit`) — used by `GET /users`

`page` ≥ 1 (default 1), `limit` 1–100 (default 20). Out-of-range / non-numeric
values are clamped, never rejected.

```jsonc
// GET /api/v1/users?page=2&limit=20
{
  "status": "success",
  "data": [ /* User[] */ ],
  "meta": { "page": 2, "limit": 20, "total": 137, "totalPages": 7, "hasNext": true, "hasPrev": true }
}
```

```ts
const { page, limit, skip } = parseOffsetPagination(req.query);
const [rows, total] = await Promise.all([
  Model.find().sort({ _id: -1 }).skip(skip).limit(limit),
  Model.countDocuments(),
]);
res.json({ status: "success", data: rows, meta: buildOffsetMeta(total, page, limit) });
```

### Cursor (`?cursor&limit`) — keyset alternative for feed-style lists

Stable under inserts and fast at scale (no deep `skip`), but no jump-to-page and
no total. **Valid only for `_id`-sorted lists** (monotonic ObjectId). An invalid
`cursor` is treated as the first page. Commented inline in
`modules/user/controller.ts` — drop it into any list that needs it:

```ts
import { Types } from "mongoose";

const { cursor, limit } = parseCursorPagination(req.query); // cursor: validated id string
// Build the ObjectId explicitly so the $lt range compares ids, not strings.
const filter = cursor ? { _id: { $lt: new Types.ObjectId(cursor) } } : {}; // $lt pairs with sort _id:-1
const rows = await Model.find(filter).sort({ _id: -1 }).limit(limit + 1); // +1 detects hasNext
const { items, meta } = buildCursorMeta(rows, limit);
res.json({ status: "success", data: items, meta }); // meta: { limit, nextCursor, hasNext }
```

## Notes

- `tokens` are also returned in the JSON body for non-browser clients;
  browsers can rely on the httpOnly cookies.
- Refresh uses rotation: the old refresh token is revoked and a new pair
  issued on every `/auth/refresh` (`src/modules/auth/service.ts`).
