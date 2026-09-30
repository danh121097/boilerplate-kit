# Project Overview / PDR

## What This Is

A Node.js + Fastify 5 + TypeScript backend starter. It includes authentication
(RS256 access tokens and rotating HS256 refresh tokens), HMAC request signing,
MongoDB via Mongoose, Socket.IO, rate limiting, optional Redis, Zod validation,
and Swagger/OpenAPI.

## Stack

| Concern              | Choice                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| Runtime / language   | Node.js >=20.19.0, TypeScript 6, strict mode                                  |
| Web framework        | Fastify 5                                                                     |
| Database             | MongoDB via Mongoose                                                          |
| Realtime             | Socket.IO 4                                                                   |
| Optional state       | Redis via ioredis                                                             |
| Validation / schemas | Zod 4 + fastify-type-provider-zod                                             |
| Auth                 | RS256 access JWT + HS256 refresh JWT + bcrypt + httpOnly cookies              |
| Package manager      | pnpm                                                                          |
| Tests                | Vitest, fastify.inject(), and mongodb-memory-server                           |
| API docs             | Fastify Swagger and Swagger UI at /docs; Try it out signs HMAC in development |

## Security Model

- Access JWTs are RS256-signed with local RSA keys and default to 15 minutes.
- Refresh JWTs are HS256-signed, SHA-256 hashed in MongoDB, and default to 7
  days. Rotation uses an atomic database claim; a 10-second grace handles
  retries. Later reuse revokes the user's sessions.
- API routes require HMAC sig and ctime headers. Signatures expire after five
  minutes; the body and query string are not signed.
- authenticate (plugins/auth.ts) checks bearer or access-cookie tokens. Admin
  user routes also enforce role rank (requireMinRole, plugins/role.ts) on the
  server.
- Redis is optional. When enabled it provides distributed rate limits, cache,
  access-token revocation, and Socket.IO cross-instance delivery.

## Commands

- pnpm dev — watch server; generates RSA keys if absent
- pnpm keys — generate local access-token keys
- pnpm build — type-check with tsconfig.build.json, then compile src to dist with swc
- pnpm typecheck — TypeScript check
- pnpm lint — ESLint
- pnpm test — Vitest
- pnpm start — run dist/server.js with Node.js

## Environment

MONGODB_URI, HMAC_SECRET, and JWT_REFRESH_SECRET are required.
JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH default to files generated under
src/keys/. REDIS_ENABLED defaults to false. LOG_LEVEL (debug, info, warn, error) defaults
to debug in development and info in production. DOCS_ENABLED (optional) forces Swagger on
or off; unset = on outside production. API_PREFIX defaults to /api/v1;
PORT defaults to 3000, REDIS_URL to redis://localhost:6379 (used when REDIS_ENABLED=true),
COOKIE_DOMAIN (optional) sets the auth cookie domain, and APP_NAME (optional) sets the Swagger title; see .env.example for all supported values.

TRUST_PROXY accepts true, false, or comma-separated IP/CIDR ranges. Numeric
hop counts are rejected by Fastify 5.12 because they cannot verify the immediate
peer address safely.

## Constraints and non-goals

- MongoDB must be reachable at startup.
- Production-like environments require a valid RSA keypair; development and
  tests may generate ephemeral keys.
- Refresh cookies are scoped to {API_PREFIX}/auth.
- Password reset, email verification, OAuth, MFA, uploads, background jobs,
  GraphQL, and deployment automation are not included.
