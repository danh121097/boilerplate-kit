# Directory Structure

The real `src/` tree, one-line purpose per file. Tests live under
`src/__tests__/` (`unit/`, `integration/`, `helpers/`).

```text
src/
├── server.ts                 # Bootstrap: connect DB + Redis, attach Socket.IO, listen
├── app.ts                    # Express app: middleware chain + route mount under API_PREFIX
│
├── config/
│   ├── environment.ts        # Loads .env, validates required vars → typed `config`
│   ├── env-validation.ts     # Zod check of NODE_ENV, PORT, ENABLE_CSRF, REDIS_ENABLED, DOCS_ENABLED, AUTH_TOKENS_IN_BODY
│   ├── database.ts           # Mongoose connect (exit on failure) + graceful shutdown handlers
│   ├── redis.ts              # Optional shared ioredis client (null when disabled)
│   ├── keys.ts               # Load RSA keypair for RS256; fail-closed outside dev/test
│   ├── duration.ts           # parseDurationSeconds: <positive int><s|m|h|d> validation
│   └── trust-proxy.ts        # parseTrustProxy: TRUST_PROXY hop count / IP list / true
│
├── docs/
│   ├── openapi.ts            # Builds the OpenAPI document from the RouteGroup registry
│   ├── schemas.ts            # publicUserSchema: Zod shape of PublicUser for OpenAPI responses
│   └── hmac-interceptor.ts   # Swagger UI request signer + dev-only bootstrap script
│
├── keys/
│   ├── setup.sh              # openssl script to generate rsa.private / rsa.public
│   ├── rsa.private           # RS256 private key (gitignored in real use)
│   └── rsa.public            # RS256 public key
│
├── middleware/
│   ├── auth.ts               # authenticate: verify access token (header/cookie) + revocation
│   ├── role.ts               # requireMinRole(...roles): role-rank hierarchy guard
│   ├── hmac.ts               # verifyHmacRequest: HMAC sig/ctime gate for all API routes
│   ├── verify-origin.ts      # Origin allow-list CSRF guard (no-op unless ENABLE_CSRF=true)
│   ├── rate-limit.ts         # global / auth / login limiters (Redis store when on)
│   ├── error-handler.ts      # global error handler → standard JSON error shape
│   └── not-found-handler.ts  # catch-all 404 JSON
│
├── models/
│   ├── user.ts               # User schema: bcrypt hash hook, comparePassword, JSON transform
│   └── refresh-token.ts      # RefreshToken schema: hashed token, TTL index, familyId, rotatedAt
│
├── modules/
│   ├── auth/
│   │   ├── routes.ts         # RouteGroup '/auth': register/login/refresh/logout/me
│   │   ├── controller.ts     # HTTP layer: read req, set cookies, shape response
│   │   ├── service.ts        # register/login/getMe (re-exports refresh/logout)
│   │   ├── refresh-session.ts # issueTokens, refresh rotation + reuse grace, logout
│   │   └── validation.ts     # validate() middleware factory + register/login Zod schemas
│   └── user/
│       ├── routes.ts         # RouteGroup '/users': list + get-by-id (both admin and above)
│       ├── controller.ts     # HTTP layer for user reads; applies serializeUser
│       ├── service.ts        # listUsers (paginated) / getUserById; password excluded
│       └── serialize-user.ts # serializeUser: allowlist projection to PublicUser
│
├── routes/
│   ├── index.ts              # Route registry: groups[] = [health, auth, user]
│   └── health-check.ts       # GET /health: server + DB + Redis status
│
├── socket/
│   ├── index.ts              # initSocket: Socket.IO server, HMAC+JWT gates, Redis adapter
│   ├── hmac-middleware.ts    # socketHmac: HMAC gate on the handshake
│   ├── auth-middleware.ts    # socketAuth: access-token gate on the handshake
│   └── events.ts             # SOCKET_EVENT registry + unauthorized message
│
├── utils/
│   ├── jwt.ts                # sign/verify access (RS256) + refresh (HS256), hashToken
│   ├── hmac.ts               # canonical string-to-sign, computeSignature, verifyHmac
│   ├── cookie.ts             # set/clear httpOnly access + refresh token cookies
│   ├── password.ts           # validatePasswordStrength, BCRYPT_ROUNDS, timing-equalizing dummy compare
│   ├── logger.ts             # Structured logger (LOG_LEVEL, secret redaction, silent in tests)
│   ├── pagination.ts         # Offset + cursor pagination helpers
│   ├── token-lifetimes.ts    # accessTtlSeconds / refreshTtlSeconds from the expiry env vars
│   ├── redis-ready.ts        # isRedisReady: skip Redis calls while the client is down
│   ├── token-revocation.ts   # per-user revoked-at in Redis (no-op when off)
│   ├── cache.ts              # cache-aside get/set/del helpers (no-op when off)
│   ├── map-database-error.ts # Mongoose/Mongo errors → 400/409 AppError (error-handler)
│   ├── route-registrar.ts    # registerGroup: build Express Router from a RouteGroup
│   └── socket-emit.ts        # emitToUser / emitBroadcast service-facing helpers
│
└── types/
    ├── index.ts              # AppError class + ErrorType + EnvironmentConfig interface
    ├── auth.ts               # ROLES, Role, ROLE_RANK, User/RefreshToken docs, JwtPayload, AuthTokens
    ├── pagination.ts         # Offset / cursor pagination param, meta and result types
    └── routing.ts            # HttpMethod, RouteConfig, RouteDocumentation, RouteGroup interfaces
│
└── __tests__/
    ├── setup.ts              # Vitest setup: in-memory MongoDB, test env vars
    ├── unit/                 # Isolated tests, one file per module under test
    ├── integration/          # supertest + mongodb-memory-server route/service/socket tests
    └── helpers/              # create-test-user, hmac-sign, loopback-server
```

## Notes

- **`config/` vs `keys/`** — `config/keys.ts` _loads_ the keypair; `keys/` _holds_
  the PEM files and the generator script.
- **`models/` vs `types/auth.ts`** — Mongoose schemas live in `models/`; their
  TypeScript document interfaces live in `types/auth.ts` (single source of truth).
- **`utils/` is stateless** — pure-ish helpers; anything stateful (DB/Redis/socket)
  reaches in through `config/*` or `socket/index.ts` accessors.
