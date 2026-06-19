# System Architecture

How this NestJS + TypeScript backend is wired end to end: boot sequence, the
request guard pipeline, authentication, request signing, errors, data layer,
realtime, and the security posture. This is a thin hub — each topic links to a
focused page under [`system-architecture/`](./system-architecture/).

## Stack At A Glance

| Concern | Choice |
| --- | --- |
| Runtime / language | Node.js + TypeScript (package manager: **pnpm**, PM-agnostic) |
| Framework | NestJS 11 (`@nestjs/platform-express`) |
| Data store | MongoDB via `@nestjs/mongoose` |
| Access tokens | JWT **RS256** (RSA keypair), 15 min default |
| Refresh tokens | JWT **HS256** (symmetric secret), 7 day default, httpOnly cookie, DB-tracked + rotated, reuse-detected |
| Request integrity | HMAC-SHA256 signature on every route (and socket handshake) |
| Realtime | Socket.IO via `@nestjs/websockets` (HMAC + JWT gated handshake) |
| API docs | `@nestjs/swagger` — live OpenAPI UI at `/docs` |
| Optional cache / scale | Redis (throttler store, token revocation, cache, socket adapter) |

## Boot Sequence

`src/main.ts` is the entry point. Order matters:

1. `NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })`
   — builds the DI container, instantiates every module/provider. The env Zod
   schema validates required vars and `AppConfigService` loads + self-tests the
   RSA keypair during this phase; a bad config or key pair fails the boot.
2. Apply Express-level middleware: `helmet()`, `compression()`, `cookieParser()`.
3. `setGlobalPrefix(apiPrefix)`, `enableCors({ origin, credentials: true })`,
   `enableShutdownHooks()`.
4. Mount Swagger at `/docs` (JSON at `/docs-json`).
5. **If `REDIS_ENABLED`** — install `RedisIoAdapter` (must run before
   `listen()`, or it silently no-ops).
6. `app.listen(port)`.

The global `SecurityGuard` + throttler guard (`APP_GUARD`), `ZodValidationPipe`
(`APP_PIPE`), and `HttpExceptionFilter` (`APP_FILTER`) are registered inside the
modules, so they are active as soon as the container is built. Shutdown hooks
close Mongo, Redis, and the WS server gracefully.

## Topics

| Page | Covers |
| --- | --- |
| [request-flow.md](./system-architecture/request-flow.md) | The composite `SecurityGuard` order, global pipe/filter, controller → service flow |
| [auth-jwt-refresh.md](./system-architecture/auth-jwt-refresh.md) | RS256 access + HS256 httpOnly refresh-cookie rotation, reuse detection, RefreshToken model, revocation |
| [hmac-verification.md](./system-architecture/hmac-verification.md) | The canonical signing string, `derivePath`, freshness + timing-safe compare, the client invariant |
| [error-handling.md](./system-architecture/error-handling.md) | `AppException`, the `HttpExceptionFilter` envelope, 404 handling, validation errors |
| [database-mongoose.md](./system-architecture/database-mongoose.md) | Mongoose schemas, `toJSON` transform, indexes, connection config |
| [realtime-socket.md](./system-architecture/realtime-socket.md) | `@WebSocketGateway` setup, handshake gates, events, emit helpers, `RedisIoAdapter` |
| [security-rate-limit.md](./system-architecture/security-rate-limit.md) | helmet, CORS-with-credentials, RBAC, named throttlers, Redis-backed store |

## Cross-Cutting Invariants

- **Redis is optional.** Every Redis consumer (throttler store, cache, token
  revocation, socket adapter) degrades to a safe no-op when Redis is off and
  fails open on Redis errors — an outage never locks users out or 500s a route.
- **HMAC contract is shared with the frontend.** The canonical string and
  Base64-HMAC-SHA256 encoding in `src/common/hmac.service.ts` MUST byte-match the
  client signer (`templates/vuejs` / `templates/nuxtjs`
  `src/services/core/hmac-signature.ts`). See
  [hmac-verification.md](./system-architecture/hmac-verification.md).
- **One error envelope.** All errors flow through `AppException` and the global
  `HttpExceptionFilter`, emitting a single response shape the client error type
  expects.
- **Deterministic guard order.** A single composite `SecurityGuard` runs HMAC →
  origin/CSRF → JWT → role, independent of `APP_GUARD` array position.
