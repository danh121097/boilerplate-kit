# Project Overview / PDR

## What This Is

A NestJS 11 + TypeScript backend starter. It ships a complete auth stack (JWT
access tokens + httpOnly refresh-token rotation with reuse detection), HMAC
request verification, MongoDB persistence via Mongoose, Socket.IO realtime,
named-throttler rate limiting, and an optional Redis tier — wired through Nest's
module / controller / service / provider model with a single composite
`SecurityGuard` and a global `ZodValidationPipe`.

## Stack

| Concern | Choice |
| --- | --- |
| Runtime / language | Node.js, TypeScript 5 (strict, `target` ES2022, `module` commonjs, decorators on) |
| Framework | NestJS 11 (`@nestjs/platform-express`) |
| Database | MongoDB via `@nestjs/mongoose` (`src/database/*`, `src/schemas/*`) |
| Realtime | Socket.IO 4 via `@nestjs/websockets` / `@nestjs/platform-socket.io` (`src/realtime/*`) |
| Optional cache/state | Redis via ioredis (`src/redis/*`) |
| Validation | Zod 4 + `nestjs-zod` DTOs (`createZodDto`) + global `ZodValidationPipe` |
| Auth | JWT (RS256 access + HS256 refresh) + bcrypt + httpOnly cookies |
| Rate limiting | `@nestjs/throttler` (named throttlers; Redis storage when enabled) |
| API docs | `@nestjs/swagger` — live OpenAPI UI at `/docs`, JSON at `/docs-json` |
| Package manager | pnpm recommended (scripts are PM-agnostic — npm/yarn/bun work too) |
| Tests | Vitest (via `unplugin-swc`) + supertest + socket.io-client + `mongodb-memory-server` |

## Auth Model

- **Access token** — RS256 JWT (private/public RSA keypair), 15min default,
  `token_use: "access"`. Sent via `Authorization: Bearer` or `accessToken` cookie.
- **Refresh token** — HS256 JWT signed with the symmetric secret
  `JWT_REFRESH_SECRET`, 7d default, `token_use: "refresh"`, random `jti`. Stored SHA-256-hashed in
  MongoDB; rotated on every `/auth/refresh` (old revoked, new issued). Replaying
  a revoked token triggers **reuse detection** (all user sessions revoked).
  Delivered as an httpOnly cookie.
- **Revocation** — logout / refresh-reuse records a per-user "revoked at"
  timestamp in Redis; any access token with an earlier `iat` is rejected
  (no-op + fail-open when Redis is off).

> Access tokens use **RS256** signed with the RSA keypair in `src/keys/` (the
> private key signs, the public key verifies — so any resource server can verify
> with the distributable public key). Refresh tokens use **HS256** signed with
> the symmetric secret `JWT_REFRESH_SECRET`, which is correct because a refresh
> token is only ever verified by this auth server. They also differ by their
> `token_use` claim, their expiry, and the fact that refresh tokens are
> DB-tracked, httpOnly-cookie-delivered, rotated, and reuse-detected. The
> `token_use` claim means a refresh token can never satisfy access verification.

## HMAC Verification

Every request (including `/health`, `@Public` routes, and the Socket.IO
handshake) must carry `sig` + `ctime` headers. The HMAC step of `SecurityGuard`
recomputes an HMAC-SHA256 over `[method, contentType, ctime, path, ""].join("\n")`
and compares in constant time; timestamps older than 5 minutes are rejected
(replay protection). The signed `path` is derived by stripping the global API
prefix from `req.originalUrl` (`derivePath`). See `src/common/hmac.service.ts`
and `src/common/guards/security.guard.ts`.

## Optional Redis Tier

`REDIS_ENABLED=false` runs the app fully without Redis. Turning it on activates
features that each fail open / no-op when off: distributed throttler storage, the
`cache` helper (`src/common/cache.service.ts`), access-token revocation, and the
cross-instance Socket.IO adapter (`RedisIoAdapter`).

## Scripts (`package.json`)

```bash
pnpm dev            # nest start --watch (predev generates RSA keys if absent)
pnpm build          # nest build
pnpm typecheck      # tsc --noEmit -p tsconfig.json
pnpm start          # node dist/src/main.js  (start:prod identical)
pnpm lint           # eslint "src/**/*.ts"   (lint:fix to autofix)
pnpm format         # prettier --write .     (format:check to verify)
pnpm test           # vitest run             (test:watch, test:coverage)
pnpm keys           # node scripts/ensure-keys.mjs  (generate/rotate RSA keypair)
```

> Scripts are package-manager agnostic. pnpm is recommended; `npm run …`,
> `yarn …`, or `bun run …` work identically.

## Environment (`.env.example`)

`APP_NAME`, `NODE_ENV`, `PORT`, `MONGODB_URI`, `API_PREFIX`, `ENABLE_CSRF`,
`COOKIE_DOMAIN`, `JWT_PRIVATE_KEY_PATH`, `JWT_PUBLIC_KEY_PATH`,
`JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `HMAC_SECRET`,
`REDIS_ENABLED`, `REDIS_URL`, `LOG_LEVEL`.

`MONGODB_URI`, `HMAC_SECRET` (min 32 chars), `JWT_REFRESH_SECRET` (min 32 chars),
`JWT_PRIVATE_KEY_PATH`, and `JWT_PUBLIC_KEY_PATH` are **required** — the Zod env
schema (`src/config/env.schema.ts`) throws at boot if any are missing or invalid.
Redis vars are optional.

## Constraints

- MongoDB must be reachable at boot — connection fails fast and exits.
- RSA key files are required: `AppConfigService` loads them and runs a
  sign/verify self-test (`src/config/keys.ts`); a mismatched pair fails at boot,
  not at runtime. Generate with `pnpm keys` or `src/keys/setup.sh`.
- HMAC applies to **every** route — clients (and Swagger "Try it out") must send
  a valid `sig`/`ctime` pair.

## What's NOT Included

- No password reset / email verification / email sending.
- No OAuth / social login / MFA.
- No user-update or delete endpoints (only list + get-by-id).
- No file uploads, jobs/queues, or GraphQL.
- No deployment manifests beyond the template's `Dockerfile` / `docker-compose.yml`.
- API docs are live via Swagger at `/docs`; there is no separate doc generator.
