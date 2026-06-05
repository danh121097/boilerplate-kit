# System Architecture

How this Express + TypeScript backend is wired end to end: boot sequence, the
request middleware pipeline, authentication, request signing, errors, data
layer, realtime, and the security posture. This is a thin hub — each topic links
to a focused page under [`system-architecture/`](./system-architecture/).

## Stack At A Glance

| Concern | Choice |
| --- | --- |
| Runtime / language | Node.js + TypeScript (package manager: **bun**) |
| HTTP framework | Express 5 |
| Data store | MongoDB via Mongoose |
| Access tokens | JWT **RS256** (RSA keypair), 15 min default |
| Refresh tokens | JWT **HS256** secret, 7 day default, httpOnly cookie, DB-tracked + rotated |
| Request integrity | HMAC-SHA256 signature on every API route (and socket handshake) |
| Realtime | Socket.IO (HMAC + JWT gated handshake) |
| Optional cache / scale | Redis (rate-limit store, token revocation, cache, socket adapter) |

## Boot Sequence

`src/server.ts` is the entry point. Order matters:

1. `connectDatabase()` — connect MongoDB (`src/config/database.ts`), exit on failure.
2. `connectRedis()` — lazily connect Redis if `REDIS_ENABLED=true`, else no-op.
3. **Then** dynamically `import("./app")` and `import("./socket")` — deferred so
   the rate-limit store and Socket.IO Redis adapter see the live Redis client
   (those modules read `getRedis()` at import time).
4. `createServer(app)` + `initSocket(httpServer)` + `httpServer.listen(port)`.

`SIGINT` / `SIGTERM` trigger `gracefulShutdown()`: close Socket.IO, MongoDB, then
Redis, and exit.

## Topics

| Page | Covers |
| --- | --- |
| [request-flow.md](./system-architecture/request-flow.md) | The `app.ts` middleware pipeline, declarative route registry, controller → service flow |
| [auth-jwt-refresh.md](./system-architecture/auth-jwt-refresh.md) | RS256 access + HS256 httpOnly refresh-cookie rotation, RefreshToken model, revocation |
| [hmac-verification.md](./system-architecture/hmac-verification.md) | The canonical signing string, freshness + timing-safe compare, the client invariant |
| [error-handling.md](./system-architecture/error-handling.md) | `AppError`, the error-handler envelope, not-found handler, validation errors |
| [database-mongoose.md](./system-architecture/database-mongoose.md) | Mongoose models, `toJSON` transform, indexes, connection config |
| [realtime-socket.md](./system-architecture/realtime-socket.md) | Socket.IO setup, handshake gates, events, emit helpers |
| [security-rate-limit.md](./system-architecture/security-rate-limit.md) | helmet, CORS-with-credentials, rate limiters, Redis-backed store |

## Cross-Cutting Invariants

- **Redis is optional.** Every Redis consumer (rate limit, cache, token
  revocation, socket adapter) degrades to a safe no-op when Redis is off and
  fails open on Redis errors — an outage never locks users out or 500s a route.
- **HMAC contract is shared with the frontend.** The canonical string and
  Base64-HMAC-SHA256 encoding in `src/utils/hmac.ts` MUST byte-match the client
  signer (`templates/vuejs` / `templates/nuxtjs`
  `src/services/core/hmac-signature.ts`). See
  [hmac-verification.md](./system-architecture/hmac-verification.md).
- **One error envelope.** All errors flow through `AppError` and the global
  error-handler, emitting a single response shape the client error type expects.
