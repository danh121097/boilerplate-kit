# Directory Structure

The real `src/` tree, one-line purpose per file. Tests live under `test/`
(unit + e2e) plus a couple of co-located `*.spec.ts` next to the code they prove.

```text
src/
├── main.ts                    # Bootstrap: Nest app, helmet/compression/cookie-parser, global prefix, CORS, Swagger /docs, Redis WS adapter, listen
├── app.module.ts             # Root module: imports every feature module; registers SecurityGuard + throttler guard as APP_GUARD
│
├── config/
│   ├── config.module.ts       # AppConfigModule: ConfigModule.forRoot with Zod env validation; provides AppConfigService
│   ├── app-config.service.ts  # Typed getters for every env var; loads + self-tests RSA keypair at construction
│   ├── env.schema.ts          # Zod schema: required vs optional env vars + defaults; validateEnv()
│   └── keys.ts                # loadRsaKeyPair: read PEM files, sign/verify self-test (fail-closed)
│
├── keys/
│   ├── setup.sh               # openssl script to generate rsa.private / rsa.public
│   └── .gitkeep               # keeps the dir; generated keys are gitignored
│
├── common/                    # @Global CommonModule — shared providers, guards, pipes, filters
│   ├── common.module.ts       # Registers HttpExceptionFilter (APP_FILTER) + ZodValidationPipe (APP_PIPE) + LoggerMiddleware; exports services
│   ├── token.service.ts       # sign/verify access (RS256, RSA keypair) + refresh (HS256, symmetric secret), hashToken
│   ├── hmac.service.ts        # canonical string-to-sign, computeSignature, verifyHmac, constants (MAX age, SOCKET path)
│   ├── token-revocation.service.ts # per-user revoked-at in Redis (no-op + fail-open when off)
│   ├── password.service.ts    # validatePasswordStrength (length + complexity)
│   ├── cache.service.ts       # cache-aside get/set/del helpers (no-op when Redis off)
│   ├── cookie.util.ts         # set/clear httpOnly access + refresh token cookies
│   ├── pagination.util.ts     # offset + cursor pagination parsers/meta builders
│   ├── guards/
│   │   └── security.guard.ts  # Composite guard: HMAC → origin/CSRF → JWT → role; derivePath helper
│   ├── decorators/
│   │   ├── public.decorator.ts      # @Public() → IS_PUBLIC_KEY (skip JWT step)
│   │   ├── roles.decorator.ts       # @Roles(role) → ROLES_KEY (min-role rank)
│   │   └── current-user.decorator.ts # @CurrentUser() param decorator → req.user
│   ├── exceptions/
│   │   └── app.exception.ts   # AppException (extends HttpException) + ErrorType union
│   ├── filters/
│   │   └── http-exception.filter.ts # global filter → standard JSON error envelope
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
│   │   ├── auth.service.ts     # register/login/refresh-rotate+reuse-detect/logout/getMe; throws AppException
│   │   └── dto/
│   │       ├── login.dto.ts    # LoginDto (createZodDto)
│   │       ├── register.dto.ts # RegisterDto (createZodDto)
│   │       └── refresh.dto.ts  # RefreshDto (optional refreshToken, falls back to cookie)
│   └── user/
│       ├── user.module.ts      # forFeature([User]); UserController + UserService
│       ├── user.controller.ts  # @Controller('users'): list (@Roles admin) + get-by-id
│       └── user.service.ts     # listUsers (offset pagination) + getUserById
│
├── realtime/
│   ├── realtime.module.ts     # EventsGateway + SocketEmitService
│   ├── events.gateway.ts      # @WebSocketGateway: handleConnection HMAC→JWT, per-user room, AUTHENTICATED
│   ├── redis-io.adapter.ts    # RedisIoAdapter: pub/sub fan-out + CORS/heartbeat/payload cap
│   ├── socket-emit.service.ts # emitToUser / emitBroadcast service-facing helpers
│   └── events.ts              # SOCKET_EVENT registry + SOCKET_UNAUTHORIZED
│
├── health/
│   ├── health.module.ts       # HealthController
│   └── health.controller.ts   # GET /health (@Public): server + DB + Redis status
│
└── redis/
    ├── redis.module.ts        # @Global RedisModule: shared ioredis client (or null) + lifecycle
    ├── redis.service.ts       # getClient(): Redis | null
    └── redis.constants.ts     # REDIS_CLIENT injection token
```

## Notes

- **`config/` holds the keypair loader** (`keys.ts`) while `keys/` holds the PEM
  files and the generator script. `AppConfigService` calls the loader once.
- **`schemas/` vs `types/auth.types.ts`** — Mongoose `@Schema` classes live in
  `schemas/`; the shared TypeScript types (`Role`, `JwtPayload`) live in
  `common/types/auth.types.ts` (single source of truth for `ROLES` / `ROLE_RANK`).
- **`common/` is `@Global`** — its services are injectable everywhere without a
  module re-import. Anything stateful (Redis, DB) is reached through a provider.
