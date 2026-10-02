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
  (`SocketIoAdapter`, Redis on or off) uses the same origins + `credentials: true`.

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

The guard's step 2 is a CSRF origin check, gated by `ENABLE_CSRF` and
deny-by-default: only the safe methods `GET`, `HEAD` and `OPTIONS` are exempt;
every other method is checked
([`origin-check.ts`](../../src/common/guards/origin-check.ts)). When enabled, the
request's `Origin` (falling back to the `Referer` origin) must be in the allowed
CORS origins, else `403 AUTHORIZATION_ERROR`. Disabled by default.

**Exemption:** a request with no `Cookie`, no `Origin` and no `Referer` header is
let through. CSRF forges a browser's ambient credentials; a request that carries
none (a native app or server client) has nothing to forge, and browsers always
send `Origin` on cross-site POSTs, so browser CSRF stays closed. The raw header
presence is tested, so a malformed `Referer` is not mistaken for an absent one.

The same predicate (`isOriginAllowed`) guards the Socket.IO handshake: the adapter's
`allowRequest` refuses a polling or upgrade request whose `Origin` is not allowed or
that carries a `Cookie` without an allowed `Origin`, while a cookie-less native
client connects. CORS headers alone do not stop a websocket upgrade.

**Same-origin handshake:** the adapter also lets a handshake through when its `Origin`
host (`new URL(origin).host`, case-insensitive) equals the request's `Host` header.
React Native's WebSocket sends the API's own origin and may attach cookies from its
jar, so without this rule it would be refused with `ENABLE_CSRF=true`. Another port on
the same hostname, an `Origin: null`, or an unparsable `Origin` is not same-origin; a
foreign `Origin`, a `Cookie` without an `Origin`, and a foreign `Referer` stay refused.

## Rate Limiting

[`throttler.module.ts`](../../src/common/throttler/throttler.module.ts) configures
`@nestjs/throttler` with **named throttlers** and registers a custom
`AppThrottlerGuard` as a global `APP_GUARD`:

| Throttler name | Window | Max | Applied to                                        |
| -------------- | ------ | --- | ------------------------------------------------- |
| `default`      | 60 s   | 100 | all routes (global cap)                           |
| `auth`         | 15 min | 30  | `/auth/register`, `/auth/refresh`, `/auth/logout` |
| `login`        | 15 min | 30  | `/auth/login` (brute-force protection)            |

Counters are keyed by throttler name + a SHA-256 hash of the client (the raw IP
never reaches Redis), not by route: `register`,
`refresh` and `logout` draw from **one** `auth` bucket, `login` has its own, and
`default` is one bucket per client across every route
(`generateKey` in `AppThrottlerGuard`; pinned by
`test/e2e/rate-limit-throttler.e2e-spec.ts`).

What is counted: `AppThrottlerGuard` runs **before** `SecurityGuard` (both are
`APP_GUARD`s registered in that order in `AppModule`; global guards run in
registration order), so a request that `SecurityGuard` later rejects (unsigned/stale
HMAC, CSRF origin, missing or bad JWT, role) is counted too, notably a flood of bad
JWTs is capped at 100/min like in Express and Fastify (pinned by the "counts requests
the JWT guard rejects" case in `rate-limit-throttler.e2e-spec.ts`). Which routes opt
in to `auth`/`login` is unchanged. A signed request to an unknown route is counted
against `default` as well.

Rate limits key on the client IP. Behind a reverse proxy set `TRUST_PROXY`
(`true`/`false`, a hop count such as `1`, or a comma-separated list of
IPs/subnets) so Express reads the real client address from `X-Forwarded-For`;
unset (default) ignores forwarded headers. Applied in `configureApp` via
`app.set("trust proxy", value)`; an invalid value fails the boot. Prefer a hop
count (e.g. `1`) over `true`: `true` trusts the leftmost `X-Forwarded-For` entry,
which a client can forge. Without a correct `TRUST_PROXY` behind a proxy or NAT, all
clients share one IP and one bucket, and the shared `auth` bucket (30 / 15 min) can
be exhausted for everyone.

`@nestjs/throttler` v6 runs every named throttler on every route, so `auth` and
`login` carry a `skipIf` (`skipUnlessOptedIn`) and only count on routes that name
them in `@Throttle`. They layer **on top of** the global `default` cap:

```ts
@Throttle({ default: { limit: 100, ttl: 60_000 }, login: { limit: 30, ttl: 900_000 } })
```

`AppThrottlerGuard` customizes three behaviors:

- **`shouldSkip` → true when `NODE_ENV=test`** — disabled under test.
- **`handleRequest` fail-open** — a storage (Redis) error is caught and the
  request is allowed through, so a Redis outage never 500s an endpoint. The 429
  (an `HttpException`) is always rethrown. The failure is logged as one short
  `warn` (reason only, no stack) at most once per 60 s, not per request.
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
the cache helper (`src/common/services/cache.service.ts`), token revocation, and the
socket adapter. It is intentionally optional:

- Disabled unless `REDIS_ENABLED=true`; otherwise `getClient()` returns `null`
  and every consumer degrades to its no-Redis behavior.
- The shared client uses `lazyConnect`, `maxRetriesPerRequest: 2`,
  `enableOfflineQueue: false` and `commandTimeout: 1000`, and every consumer
  short-circuits when `client.status !== "ready"` (`isRedisReady`): rate-limit
  storage, revocation, cache and health fail open immediately (health reports
  `down` without a PING) instead of hanging requests during an outage.
- A Redis failure **never exits the process** (unlike MongoDB) — the app runs
  fully without it.

Turning Redis on activates, together: the distributed throttler store,
access-token revocation on logout/reuse, the cache-aside helpers, and the
cross-instance Socket.IO adapter.

## Other Hardening

- **Password strength** — `PasswordService.validatePasswordStrength`
  (`src/modules/auth/password.service.ts`) requires ≥8 chars with lowercase, uppercase,
  digit, and special char on register.
- **bcrypt** (cost 12) for password storage; `select: false` keeps the hash out
  of query results. Login compares against a fixed dummy hash for unknown or
  inactive users, so those cost the same as a wrong password.
- **HMAC** request signing on every route — see
  [hmac-verification.md](./hmac-verification.md).
- **Secrets via env** — `HMAC_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars), and the
  RSA key paths (`JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`) are required (the
  Zod env schema throws if missing); never commit them.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — authentication + revocation
- [hmac-verification.md](./hmac-verification.md) — request signing
- [request-flow.md](./request-flow.md) — where these sit in the pipeline
