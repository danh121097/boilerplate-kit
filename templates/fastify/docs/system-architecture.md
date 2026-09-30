# System Architecture

Fastify app setup, request lifecycle, authentication, signing, persistence,
realtime, and security controls. Topic pages live in
[system-architecture/](./system-architecture/).

## Stack

| Concern         | Choice                                                      |
| --------------- | ----------------------------------------------------------- |
| Runtime         | Node.js >=20.19.0 + TypeScript                              |
| HTTP            | Fastify 5                                                   |
| Data            | MongoDB via Mongoose                                        |
| Access token    | RS256, 15-minute default                                    |
| Refresh token   | HS256, 7-day default, httpOnly cookie, database tracked     |
| Request signing | HMAC-SHA256 on API routes and socket handshake              |
| Realtime        | Socket.IO attached to Fastify's Node HTTP server            |
| Optional state  | Redis for rate limit, cache, revocation, and socket adapter |

## Boot and shutdown

src/server.ts connects MongoDB, starts the optional Redis client, builds the
Fastify app (including Socket.IO attached to app.server), and listens. SIGINT
and SIGTERM call app.close() to drain HTTP work and close Socket.IO, then
disconnect MongoDB and Redis. Startup failure closes resources already opened.

## Request path

Fastify registers cookie, CORS, helmet, compression, Swagger, and rate-limit
plugins. Root onRequest hooks enforce HMAC and optional CSRF checks before
route handlers. Route plugins live under API_PREFIX; auth and user routes use
Zod schemas for input validation, response serialization, and OpenAPI output.
Errors flow through the shared Fastify error handler.

## Topics

| Page                                                                   | Covers                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [request-flow.md](./system-architecture/request-flow.md)               | Plugin registration, hooks, route plugins, controller/service flow |
| [auth-jwt-refresh.md](./system-architecture/auth-jwt-refresh.md)       | RS256 access + HS256 refresh rotation, cookie and revocation rules |
| [hmac-verification.md](./system-architecture/hmac-verification.md)     | Canonical signing string and freshness checks                      |
| [error-handling.md](./system-architecture/error-handling.md)           | AppError, validation mapping, common response envelope             |
| [database-mongoose.md](./system-architecture/database-mongoose.md)     | Models, indexes, connection configuration                          |
| [realtime-socket.md](./system-architecture/realtime-socket.md)         | Socket.IO authentication, Redis adapter, shutdown                  |
| [security-rate-limit.md](./system-architecture/security-rate-limit.md) | Fastify security plugins, CSRF option, RBAC, rate limits           |

## Invariants

- Redis is optional; request paths and health checks remain available without it.
- Every route below API_PREFIX requires HMAC, including public auth and health
  routes. Swagger is outside that prefix.
- Auth and user responses go through serializeUser, an allowlist that never
  exposes stored password hashes.
- AppError and the global handler define the shared error response contract.
