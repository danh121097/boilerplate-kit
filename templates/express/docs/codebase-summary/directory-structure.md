# Directory Structure

The real `src/` tree, one-line purpose per file. Tests live under
`src/__tests__/` and mirror these modules.

```text
src/
├── server.ts                 # Bootstrap: connect DB + Redis, attach Socket.IO, listen
├── app.ts                    # Express app: middleware chain + route mount under API_PREFIX
│
├── config/
│   ├── environment.ts        # Loads .env, validates required vars → typed `config`
│   ├── database.ts           # Mongoose connect (fail-fast) + graceful shutdown handlers
│   ├── redis.ts              # Optional shared ioredis client (null when disabled)
│   └── keys.ts               # Load RSA keypair for RS256; fail-closed outside dev/test
│
├── keys/
│   ├── setup.sh              # openssl script to generate rsa.private / rsa.public
│   ├── rsa.private           # RS256 private key (gitignored in real use)
│   └── rsa.public            # RS256 public key
│
├── middleware/
│   ├── auth.ts               # authenticate: verify access token (header/cookie) + revocation
│   ├── role.ts               # authorize(...roles): role-rank hierarchy guard
│   ├── hmac.ts               # verifyHmacRequest: HMAC sig/ctime gate for all API routes
│   ├── rate-limit.ts         # global / auth / login limiters (Redis store when on)
│   ├── error-handler.ts      # global error handler → standard JSON error shape
│   └── not-found-handler.ts  # catch-all 404 JSON
│
├── models/
│   ├── user.ts               # User schema: bcrypt hash hook, comparePassword, JSON transform
│   └── refresh-token.ts      # RefreshToken schema: hashed token, TTL index, isRevoked
│
├── modules/
│   ├── auth/
│   │   ├── routes.ts         # RouteGroup '/auth': register/login/refresh/logout/me
│   │   ├── controller.ts     # HTTP layer: read req, set cookies, shape response
│   │   ├── service.ts        # Business logic: register/login/refresh-rotate/logout/getMe
│   │   └── validation.ts     # validate() middleware factory + register/login Zod schemas
│   └── user/
│       ├── routes.ts         # RouteGroup '/users': list (admin) + get-by-id
│       └── controller.ts     # HTTP layer for user reads
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
│   ├── password.ts           # validatePasswordStrength (length + complexity)
│   ├── token-revocation.ts   # per-user revoked-at in Redis (no-op when off)
│   ├── cache.ts              # cache-aside get/set/del helpers (no-op when off)
│   ├── route-registrar.ts    # registerGroup: build Express Router from a RouteGroup
│   └── socket-emit.ts        # emitToUser / emitBroadcast service-facing helpers
│
└── types/
    ├── index.ts              # AppError class + ErrorType + EnvironmentConfig interface
    ├── auth.ts               # ROLES, Role, User/RefreshToken docs, JwtPayload, AuthTokens
    └── routing.ts            # HttpMethod, RouteConfig, RouteGroup interfaces
```

## Notes

- **`config/` vs `keys/`** — `config/keys.ts` *loads* the keypair; `keys/` *holds*
  the PEM files and the generator script.
- **`models/` vs `types/auth.ts`** — Mongoose schemas live in `models/`; their
  TypeScript document interfaces live in `types/auth.ts` (single source of truth).
- **`utils/` is stateless** — pure-ish helpers; anything stateful (DB/Redis/socket)
  reaches in through `config/*` or `socket/index.ts` accessors.
