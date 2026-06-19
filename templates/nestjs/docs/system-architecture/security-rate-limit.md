# Security & Rate Limiting

The transport-level hardening applied to every request: security headers, CORS
with credentials, role-based authorization, and named-throttler rate limiting.
Source: [`main.ts`](../../src/main.ts),
[`common/throttler/throttler.module.ts`](../../src/common/throttler/throttler.module.ts),
[`common/guards/security.guard.ts`](../../src/common/guards/security.guard.ts),
[`redis/redis.service.ts`](../../src/redis/redis.service.ts).

## Security Headers — helmet

`app.use(helmet())` is applied in `main.ts` (before routing), setting standard
hardening headers (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, etc.) on
every response. `compression()` and `cookieParser()` are applied alongside it.

## CORS With Credentials

```ts
app.enableCors({ origin: config.corsOrigins, credentials: true });
```

- **`credentials: true`** is required for the browser to send/receive the httpOnly
  auth cookies — without it cookie-based auth breaks cross-origin.
- **`origin`** comes from the configured CORS origins; the Socket.IO server
  (`RedisIoAdapter`) uses the same origins + `credentials: true`.

## Authentication & Authorization

Both are steps of the composite `SecurityGuard` (see
[request-flow.md](./request-flow.md)):

- **Authentication** — the JWT step verifies the access token and runs the
  revocation check; see [auth-jwt-refresh.md](./auth-jwt-refresh.md).
- **Authorization** — the role step enforces a rank hierarchy when a route
  carries `@Roles(...)`. It runs **after** the JWT step (it needs `req.user`):

```ts
const ROLE_RANK = { user: 1, admin: 2, super_admin: 3 };
if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) {
  throw new AppException({ statusCode: 403, errorType: "AUTHORIZATION_ERROR", ... });
}
```

So `@Roles('admin')` allows `admin` and `super_admin`; a higher role never needs
to be listed. Missing `req.user` → 401; insufficient rank → 403. Example:
`GET /users` uses `@Roles('admin')`.

### Origin / CSRF (optional)

The guard's step 2 is a CSRF origin check, gated by `ENABLE_CSRF` and applied
only to mutating methods (`POST/PUT/PATCH/DELETE`). When enabled, the request's
`Origin` (falling back to the `Referer` host) must be in the allowed CORS
origins, else `403 AUTHORIZATION_ERROR`. Disabled by default.

## Rate Limiting

[`throttler.module.ts`](../../src/common/throttler/throttler.module.ts) configures
`@nestjs/throttler` with **named throttlers** and registers a custom
`AppThrottlerGuard` as a global `APP_GUARD`:

| Throttler name | Window | Max | Applied to |
| --- | --- | --- | --- |
| `default` | 60 s | 100 | all routes (global cap) |
| `auth` | 15 min | 30 | `/auth/register`, `/auth/refresh`, `/auth/logout` |
| `login` | 15 min | 30 | `/auth/login` (brute-force protection) |

Stricter auth/login limiters layer **on top of** the global one via the route
decorator — controllers declare both so the global cap is not dropped:

```ts
@Throttle({ default: { limit: 100, ttl: 60_000 }, login: { limit: 30, ttl: 900_000 } })
```

`AppThrottlerGuard` customizes three behaviors:

- **`shouldSkip` → true when `NODE_ENV=test`** — disabled under test.
- **`handleRequest` fail-open** — a storage (Redis) error is caught and the
  request is allowed through, so a Redis outage never 500s an endpoint.
- **`throwThrottlingException`** throws `AppException({ errorType: 'RATE_LIMIT',
  statusCode: 429 })` so the standard error envelope is rendered.

### Redis-Backed Store (optional)

```ts
const client = redisService.getClient();
const storage = client ? new ThrottlerStorageRedisService(client) : undefined;
// ... throttlers: [ default, auth, login ]
```

- When Redis is **on**, counters live in Redis (shared across instances).
- When Redis is **off**, `getClient()` returns `null`, `storage` is omitted, and
  `@nestjs/throttler` uses its built-in in-memory store — correct for
  single-instance / Redis-off deployments.

## Redis: Optional By Design

[`redis/redis.service.ts`](../../src/redis/redis.service.ts) wraps a single shared
ioredis client (from the `@Global` `RedisModule`) used by the throttler store,
the cache helper (`src/common/cache.service.ts`), token revocation, and the
socket adapter. It is intentionally optional:

- Disabled unless `REDIS_ENABLED=true`; otherwise `getClient()` returns `null`
  and every consumer degrades to its no-Redis behavior.
- The client uses `lazyConnect` + `maxRetriesPerRequest: 2` so a dead Redis fails
  fast and consumers fall back instead of hanging requests.
- A Redis failure **never exits the process** (unlike MongoDB) — the app runs
  fully without it.

Turning Redis on activates, together: the distributed throttler store,
access-token revocation on logout/reuse, the cache-aside helpers, and the
cross-instance Socket.IO adapter.

## Other Hardening

- **Password strength** — `PasswordService.validatePasswordStrength`
  (`src/common/password.service.ts`) requires ≥8 chars with lowercase, uppercase,
  digit, and special char on register.
- **bcrypt** (cost 12) for password storage; `select: false` keeps the hash out
  of query results.
- **HMAC** request signing on every route — see
  [hmac-verification.md](./hmac-verification.md).
- **Secrets via env** — `HMAC_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars), and the
  RSA key paths (`JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`) are required (the
  Zod env schema throws if missing); never commit them.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — authentication + revocation
- [hmac-verification.md](./hmac-verification.md) — request integrity
- [request-flow.md](./request-flow.md) — where these sit in the pipeline
