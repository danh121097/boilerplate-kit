# Test Matrix

This file maps product behavior to proof. Proof is the test suite, run with:

```bash
bun run test     # alias for: vitest run
```

Suite as shipped: **22 test files**, **~121 specs** (18 unit + 4 integration
files under `src/__tests__/`). Counts are approximate — re-run the command for
the live number.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

Behavior → proof. Proof column = test file under `src/__tests__/`, run via
`bun run test` (`vitest run`). Spec counts in parentheses.

| Behavior | Layer | Status | Proof (`bun run test`) |
| --- | --- | --- | --- |
| Register / login / refresh / logout / me over HTTP, incl. validation + cookies | integration | implemented | `integration/auth-routes.test.ts` (11) |
| Auth service: register, login, refresh rotation, logout revocation, getMe, user pre-save hook | integration | implemented | `integration/auth-service.test.ts` (17) |
| `GET /api/v1/health` returns status + db + redis | integration | implemented | `integration/health-check.test.ts` (1) |
| Socket.IO HMAC handshake + targeted emit end-to-end | integration | implemented | `integration/socket.test.ts` (3) |
| JWT sign/verify, TTL parsing, RS256 access + HS256 refresh alg pinning (`JWT_REFRESH_SECRET`), issuer + token_use enforcement, forgery rejection | unit | implemented | `unit/jwt-utils.test.ts` (16) |
| HMAC canonical string, signature compute/verify, timestamp freshness | unit | implemented | `unit/hmac-util.test.ts` (6) |
| `authenticate` middleware: token extraction, errors, revocation check | unit | implemented | `unit/auth-middleware.test.ts` (4) |
| `requireMinRole` role-rank middleware (user/admin/super_admin) | unit | implemented | `unit/role-middleware.test.ts` (6) |
| Zod register/login schemas + `validate` middleware | unit | implemented | `unit/auth-validation.test.ts` (5) |
| Password strength validation | unit | implemented | `unit/password-utils.test.ts` (6) |
| Pagination helpers: offset clamp/skip, meta math, cursor keyset+trim | unit | implemented | `unit/pagination.test.ts` (16) |
| `GET /users` offset pagination: data/meta, clamp, `-password`, role/HMAC guards | integration | implemented | `integration/user-routes.test.ts` (7) |
| Token revocation helpers (Redis on/off) | unit | implemented | `unit/token-revocation.test.ts` (6) |
| Global error handler normalizes AppError → response shape | unit | implemented | `unit/error-handler.test.ts` (5) |
| `AppError` construction | unit | implemented | `unit/app-error.test.ts` (2) |
| Not-found handler | unit | implemented | `unit/not-found-handler.test.ts` (1) |
| RSA key-pair loader | unit | implemented | `unit/keys-loader.test.ts` (7) |
| Rate-limit store factory (Redis vs memory) | unit | implemented | `unit/rate-limit-store.test.ts` (2) |
| Redis client lifecycle (enabled/disabled) | unit | implemented | `unit/redis-client.test.ts` (4) |
| Cache helpers (enabled/disabled) | unit | implemented | `unit/cache.test.ts` (4) |
| Socket core init (Redis on/off) | unit | implemented | `unit/socket-core.test.ts` (3) |
| Socket auth middleware | unit | implemented | `unit/socket-auth.test.ts` (6) |
| Socket HMAC middleware | unit | implemented | `unit/socket-hmac.test.ts` (4) |
| Socket emit helpers (initialized/not) | unit | implemented | `unit/socket-emit.test.ts` (3) |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
