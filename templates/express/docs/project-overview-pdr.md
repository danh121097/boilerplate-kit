# Project Overview / PDR

## What This Is

A Node.js + Express 5 + TypeScript backend starter. It ships a complete auth
stack (JWT access tokens + httpOnly refresh-token rotation), HMAC request
verification, MongoDB persistence via Mongoose, Socket.IO realtime, layered rate
limiting, and an optional Redis tier — all behind a declarative module pattern
(`controller` / `service` / `routes` / `validation`).

## Stack

| Concern              | Choice                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Runtime / language   | Node.js, TypeScript 6 (strict, `target` ES2022, `module` commonjs)                                          |
| Web framework        | Express 5 (`src/app.ts`)                                                                                    |
| Database             | MongoDB via Mongoose 9 (`src/config/database.ts`, `src/models/*`)                                           |
| Realtime             | Socket.IO 4 (`src/socket/*`)                                                                                |
| Optional cache/state | Redis via ioredis (`src/config/redis.ts`)                                                                   |
| Validation           | Zod 4 (`src/modules/*/validation.ts`)                                                                       |
| Auth                 | JWT (RS256 access + HS256 refresh) + bcrypt + httpOnly cookies                                              |
| Package manager      | pnpm                                                                                                        |
| Tests                | Vitest + supertest + `mongodb-memory-server`                                                                |
| API docs             | OpenAPI generated from route declarations and Zod schemas; Swagger UI at `/docs` with dev-only HMAC signing |

## Auth Model

- **Access token** — RS256 JWT (private/public RSA keypair), 15min default,
  `token_use: "access"`. Sent via `Authorization: Bearer` or `accessToken` cookie.
- **Refresh token** — HS256 JWT signed with symmetric secret `JWT_REFRESH_SECRET`, 7d default,
  `token_use: "refresh"`, random `jti`.
  Stored SHA-256-hashed in MongoDB; rotated on every `/auth/refresh` (old revoked,
  new issued). Delivered as an httpOnly cookie scoped to `{API_PREFIX}/auth`.
- **Revocation** — logout / ban records a per-user "revoked at" timestamp in Redis;
  any access token issued earlier (by `iat_ms`) is rejected (no-op when Redis is off).

## HMAC Verification

Every request under `API_PREFIX` (and every Socket.IO handshake) must carry `sig`

- `ctime` headers. The server recomputes an HMAC-SHA256 over
  `[method, contentType, ctime, path, ""].join("\n")` and compares in constant time;
  timestamps older than 5 minutes are rejected (bounds the replay window; no nonce). See
  `src/utils/hmac.ts` and `src/middleware/hmac.ts`.

## Optional Redis Tier

`REDIS_ENABLED=false` runs the app fully without Redis. Turning it on activates
three features, each a transparent no-op when off: distributed rate-limit store,
the `cache` helper (`src/utils/cache.ts`), and access-token revocation. With Redis
on, Socket.IO also wires a pub/sub adapter for cross-instance emits.

## Scripts (`package.json`)

```bash
pnpm dev            # tsx watch src/server.ts (predev generates RSA keys if absent)
pnpm build          # tsc --noEmit -p tsconfig.build.json && swc src -d dist
pnpm typecheck      # tsc --noEmit -p tsconfig.test.json
pnpm start          # node dist/server.js
pnpm lint           # eslint src/**/*.ts   (lint:fix to autofix)
pnpm format         # prettier --write .   (format:check to verify)
pnpm test           # vitest run           (test:watch, test:coverage)
```

## Environment

`NODE_ENV`, `PORT`, `MONGODB_URI`, `API_PREFIX`,
`JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`, `JWT_REFRESH_SECRET`,
`JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `HMAC_SECRET`, `REDIS_ENABLED`,
`REDIS_URL`, `TRUST_PROXY` (optional), `DOCS_ENABLED` (optional), `LOG_LEVEL` (optional),
`ENABLE_CSRF` (optional), `COOKIE_DOMAIN` (optional), `APP_NAME` (optional; Swagger title). CORS origins are not an env var:
they are the hard-coded `corsOrigins` list in `src/config/environment.ts`.

Startup fails with a listed error when `NODE_ENV` is not `development`, `production` or `test`, when `PORT` is not a positive integer, or when `ENABLE_CSRF`, `REDIS_ENABLED` or `DOCS_ENABLED` is anything but `true` or `false` (empty counts as unset).

`MONGODB_URI`, `HMAC_SECRET`, and `JWT_REFRESH_SECRET` (symmetric secret; use
≥32 random chars, length is not enforced) are **required** — boot throws if
missing (`src/config/environment.ts`). The RSA key paths (`JWT_PRIVATE_KEY_PATH`,
`JWT_PUBLIC_KEY_PATH`) must point at readable PEM files outside `test` /
`development` (see Constraints). Redis vars are optional.

## Constraints

- MongoDB must be reachable at boot — a failed connection logs the error and exits.
- RSA key files are required outside `test` / `development`; other envs fail closed
  rather than forging tokens (`src/config/keys.ts`). Run `src/keys/setup.sh`.
- Refresh-cookie path is tied to `API_PREFIX`; changing the prefix moves the cookie.

## What's NOT Included

- No password reset / email verification / email sending.
- No OAuth / social login / MFA.
- No user-update or delete endpoints (only list + get-by-id).
- No file uploads, jobs/queues, or GraphQL.
- No deployment manifests beyond the template's `Dockerfile` / `docker-compose.yml`.
- OpenAPI paths, request bodies, and response schemas are derived from route metadata.
