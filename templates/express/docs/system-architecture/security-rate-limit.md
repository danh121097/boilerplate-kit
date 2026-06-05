# Security & Rate Limiting

The transport-level hardening applied to every request: security headers, CORS
with credentials, role-based authorization, and tiered rate limiting. Source:
[`app.ts`](../../src/app.ts), [`middleware/rate-limit.ts`](../../src/middleware/rate-limit.ts),
[`middleware/role.ts`](../../src/middleware/role.ts), [`config/redis.ts`](../../src/config/redis.ts).

## Security Headers — helmet

`app.use(helmet())` is the **first** middleware, setting standard hardening headers
(HSTS, `X-Content-Type-Options`, `X-Frame-Options`, etc.) on every response with
defaults.

## CORS With Credentials

```ts
app.use(cors({ origin: config.corsOrigin, credentials: true }));
```

- **`credentials: true`** is required for the browser to send/receive the httpOnly
  auth cookies — without it cookie-based auth breaks cross-origin.
- **`origin`** is `CORS_ORIGIN` (default `http://localhost:5173`); the Socket.IO
  server uses the same origin + `credentials: true`.

## Authentication & Authorization

- **Authentication** — `authenticate` ([`middleware/auth.ts`](../../src/middleware/auth.ts))
  verifies the access token; see [auth-jwt-refresh.md](./auth-jwt-refresh.md).
- **Authorization** — `authorize(...roles)` ([`middleware/role.ts`](../../src/middleware/role.ts))
  enforces a role hierarchy and **must run after** `authenticate`:

```ts
const ROLE_RANK = { user: 1, admin: 2, super_admin: 3 };
// least-privileged allowed role sets the bar; anyone at or above passes
const requiredRank = Math.min(...allowedRoles.map((r) => ROLE_RANK[r]));
if (ROLE_RANK[req.user.role] < requiredRank) throw new AppError({ statusCode: 403, errorType: 'AUTHORIZATION_ERROR', ... });
```

So `authorize('admin')` allows `admin` and `super_admin`; a higher role never
needs to be listed explicitly. Missing `req.user` → 401; insufficient rank → 403.
Example: `GET /users` uses `[authenticate, authorize('admin')]`.

## Rate Limiting

[`middleware/rate-limit.ts`](../../src/middleware/rate-limit.ts) defines three
limiters via `express-rate-limit`:

| Limiter | Window | Max | Applied to |
| --- | --- | --- | --- |
| `globalRateLimiter` | 1 min | 100 | all API routes (`app.use(apiPrefix, ...)`) |
| `authRateLimiter` | 15 min | 20 | `/auth/register`, `/auth/refresh`, `/auth/logout` |
| `loginRateLimiter` | 15 min | 10 | `/auth/login` (brute-force protection) |

Stricter auth/login limiters layer **on top of** the global one via the route
`middleware` chain. All limiters:

- `standardHeaders: true`, `legacyHeaders: false` (emit `RateLimit-*` headers).
- **`skip: () => isTest`** — disabled under `NODE_ENV=test`.
- **`passOnStoreError: true`** — fail-open: a Redis-store outage must not 500 the
  endpoint.
- Return `{ success: false, message: "Too many ..." }` when tripped.

### Redis-Backed Store (optional)

```ts
export function makeStore(prefix: string): Store | undefined {
  const client = getRedis();
  if (!client) return undefined;   // → express-rate-limit uses in-memory MemoryStore
  return new RedisStore({ prefix, sendCommand: (cmd, ...args) => client.call(cmd, ...args) });
}
```

- When Redis is **on**, counters live in Redis with a per-limiter key `prefix`
  (`rl:global:`, `rl:auth:`, `rl:login:`) so they are shared across instances.
- When Redis is **off**, `makeStore` returns `undefined` and each limiter uses the
  default in-memory store — correct for single-instance / Redis-off deployments.

## Redis: Optional By Design

[`config/redis.ts`](../../src/config/redis.ts) holds a single shared client used by
the rate-limit store, cache helpers ([`utils/cache.ts`](../../src/utils/cache.ts)),
token revocation, and the socket adapter. It is intentionally optional:

- Disabled unless `REDIS_ENABLED=true`; otherwise `getRedis()` returns `null` and
  every consumer degrades to its no-Redis behavior.
- `maxRetriesPerRequest: 2` bounds retries so a dead Redis fails fast and consumers
  fall back instead of hanging requests.
- A Redis failure **never exits the process** (unlike MongoDB) — the app is
  designed to run fully without it.

Turning Redis on activates, together: the distributed rate-limit store,
access-token revocation on logout, the cache-aside helpers, and the cross-instance
Socket.IO adapter.

## Other Hardening

- **Password strength** — `validatePasswordStrength`
  ([`utils/password.ts`](../../src/utils/password.ts)) requires ≥8 chars with
  lowercase, uppercase, digit, and special char on register.
- **bcrypt** (cost 12) for password storage; `select: false` keeps the hash out of
  query results.
- **HMAC** request signing on every API route — see
  [hmac-verification.md](./hmac-verification.md).
- **Secrets via env** — `HMAC_SECRET`, `JWT_REFRESH_SECRET`, and the RSA key paths
  are required (`getRequiredEnvVar` throws if missing); never commit them.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — authentication + revocation
- [hmac-verification.md](./hmac-verification.md) — request integrity
- [request-flow.md](./request-flow.md) — where these sit in the pipeline
