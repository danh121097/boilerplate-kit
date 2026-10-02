# Directory Structure

The real `src/` tree, one-line purpose per file. All tests live under `test/`
(unit + e2e + helpers) — none are co-located in `src/`.

```text
src/
├── app-setup.ts               # configureApp: trust proxy, helmet/compression/cookie-parser, prefix, CORS, socket adapter (shared with e2e)
├── main.ts                    # Bootstrap: Nest app, configureApp, Swagger /docs, listen
├── app.module.ts             # Root module: imports every feature module; registers SecurityGuard + throttler guard as APP_GUARD
│
├── config/
│   ├── config.module.ts       # AppConfigModule: ConfigModule.forRoot with Zod env validation; provides AppConfigService
│   ├── app-config.service.ts  # Typed getters for every env var; loads + self-tests RSA keypair at construction
│   ├── env.schema.ts          # Zod schema: required vs optional env vars + defaults; validateEnv()
│   ├── trust-proxy.util.ts    # parse TRUST_PROXY (bool / hop count / IP list) for Express `trust proxy`
│   └── keys.ts                # loadRsaKeyPair: read PEM files, sign/verify self-test (fail-closed)
│
├── keys/
│   ├── setup.sh               # openssl script to generate rsa.private / rsa.public
│   └── .gitkeep               # keeps the dir; generated keys are gitignored
│
├── common/                    # @Global CommonModule — shared providers, guards, pipes, filters
│   ├── common.module.ts       # Registers HttpExceptionFilter (APP_FILTER) + ZodValidationPipe (APP_PIPE) + LoggerMiddleware; exports services
│   ├── services/
│   │   ├── token.service.ts            # sign/verify access (RS256, RSA keypair), sign refresh (HS256, symmetric secret), hashToken
│   │   ├── token-revocation.service.ts # per-user revoked-at in Redis (no-op + fail-open when off)
│   │   ├── hmac.service.ts             # canonical string-to-sign, computeSignature, verifyHmac, constants (MAX age, SOCKET path)
│   │   └── cache.service.ts            # cache-aside get/set/del helpers (no-op when Redis off)
│   ├── utils/
│   │   ├── pagination.util.ts          # offset + cursor pagination parsers/meta builders
│   │   └── duration.util.ts            # parse `<n><s|m|h|d>` durations to seconds (JWT expiry, cookies, DB expiry)
│   ├── swagger/
│   │   └── hmac-interceptor.ts         # dev-tooling: auto-sign Swagger "Try it out" requests with HMAC
│   ├── throttler/
│   │   └── throttler.module.ts         # named-throttler config (default / auth / strict tiers)
│   ├── guards/
│   │   ├── security.guard.ts  # Composite guard: HMAC → origin/CSRF → JWT → role
│   │   ├── origin-check.ts    # assertAllowedOrigin: deny-by-default CSRF origin check (GET/HEAD/OPTIONS and cookie-/origin-/referer-less requests exempt)
│   │   └── derive-path.ts     # derivePath: strip apiPrefix + query to get the signed path
│   ├── decorators/
│   │   ├── public.decorator.ts      # @Public() → IS_PUBLIC_KEY (skip JWT step)
│   │   ├── roles.decorator.ts       # @Roles(role) → ROLES_KEY (min-role rank)
│   │   └── current-user.decorator.ts # @CurrentUser() param decorator → req.user
│   ├── exceptions/
│   │   └── app.exception.ts   # AppException (extends HttpException) + ErrorType union
│   ├── filters/
│   │   ├── http-exception.filter.ts # global filter → standard JSON error envelope
│   │   ├── map-database-error.ts    # Mongoose/Mongo errors → 400/409 AppException
│   │   └── map-body-parser-error.ts # body-parser errors (413 / malformed JSON / bad encoding) → 4xx AppException
│   ├── pipes/
│   │   └── zod-validation.pipe.ts   # re-export of nestjs-zod ZodValidationPipe (global)
│   ├── middleware/
│   │   └── logger.middleware.ts     # one JSON log line per request (skipped in test)
│   ├── logger/
│   │   └── app-logger.service.ts    # AppLogger: leveled, redacting LoggerService
│   └── types/
│       ├── auth.types.ts      # ROLES, ROLE_RANK, Role, JwtPayload, AuthTokens
│       └── pagination.types.ts # OffsetMeta, CursorMeta, query shapes
│
├── database/
│   └── database.module.ts     # MongooseModule.forRootAsync from config; dev query logging
│
├── schemas/
│   ├── user.schema.ts         # User: bcrypt pre-save hook, comparePassword, toJSON transform
│   └── refresh-token.schema.ts # RefreshToken: hashed token, TTL index, isRevoked
│
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts      # forFeature([User, RefreshToken]); AuthController + AuthService
│   │   ├── auth.controller.ts  # @Controller('auth'): register/login/refresh/logout/me; throttler + @Public
│   │   ├── auth.service.ts     # register/login/getMe; delegates refresh/logout; throws AppException
│   │   ├── refresh-session.service.ts # issue/rotate refresh tokens: atomic claim, reuse grace window, reuse detection, logout
│   │   ├── password.service.ts # validatePasswordStrength (length + complexity)
│   │   ├── cookie.util.ts      # set/clear httpOnly access + refresh token cookies
│   │   └── dto/
│   │       ├── login.dto.ts    # LoginDto (createZodDto)
│   │       ├── register.dto.ts # RegisterDto (createZodDto)
│   │       └── refresh.dto.ts  # RefreshDto (optional refreshToken, falls back to cookie)
│   ├── user/
│   │   ├── user.module.ts      # forFeature([User]); UserController + UserService
│   │   ├── user.controller.ts  # @Controller('users'): list (@Roles admin) + get-by-id
│   │   ├── user.service.ts     # listUsers (offset pagination) + getUserById
│   │   └── serialize-user.ts   # serializeUser allowlist → PublicUser (the response contract)
│   ├── not-found/
│   │   ├── not-found.module.ts # must stay the LAST AppModule import
│   │   └── not-found.controller.ts # @Public catch-all: unsigned 401 HMAC_ERROR, signed 404 "Resource not found!"
│   ├── health/
│   │   ├── health.module.ts    # HealthController
│   │   └── health.controller.ts # GET /health (@Public): server + DB + Redis status
│   └── realtime/
│       ├── realtime.module.ts  # EventsGateway + SocketEmitService
│       ├── events.gateway.ts   # @WebSocketGateway: handleConnection joins per-user room, emits AUTHENTICATED
│       ├── handshake-middleware.ts # io.use HMAC + JWT gates (reject at handshake)
│       ├── socket-io.adapter.ts # SocketIoAdapter: CORS/heartbeat/payload cap (always) + Redis pub/sub fan-out (when enabled)
│       ├── socket-emit.service.ts # emitToUser / emitBroadcast / disconnectUser service-facing helpers
│       └── events.ts           # SOCKET_EVENT registry + SOCKET_UNAUTHORIZED
│
└── redis/
    ├── redis.module.ts        # @Global RedisModule: shared ioredis client (or null) + lifecycle
    ├── redis.service.ts       # getClient(): Redis | null
    ├── redis.constants.ts     # REDIS_CLIENT injection token
    ├── redis-ready.util.ts    # isRedisReady: connected-and-usable check (outage fails open)
    └── safe-pub-client.ts     # pub-client proxy: publish rejections become warn logs (socket adapter)
```

## Notes

- **Feature modules live under `modules/`** (auth, user, health, realtime), each a
  Nest module with its own controller/service. Infrastructure modules stay
  top-level: `config/`, `database/`, `redis/`, plus the `@Global` `common/`.
- **`common/` is organized by kind** — shared services under `common/services/`,
  utilities under `common/utils/`, Swagger dev-tooling under `common/swagger/`,
  and named-throttler config under `common/throttler/`.
- **Auth-domain helpers live with auth** — `password.service.ts` and
  `cookie.util.ts` sit in `modules/auth/`. The foundational `auth.types.ts`
  stays in `common/types/` since guards and the token service depend on it.
- **`config/` holds the keypair loader** (`keys.ts`) while `keys/` holds the PEM
  files and the generator script. `AppConfigService` calls the loader once.
- **`schemas/` vs `types/auth.types.ts`** — Mongoose `@Schema` classes live in
  `schemas/`; the shared TypeScript types (`Role`, `JwtPayload`) live in
  `common/types/auth.types.ts` (single source of truth for `ROLES` / `ROLE_RANK`).
- **`common/` is `@Global`** — its services are injectable everywhere without a
  module re-import. Anything stateful (Redis, DB) is reached through a provider.
