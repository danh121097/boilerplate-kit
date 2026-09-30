# Directory Structure

This tree reflects the current template. Unit and integration tests live in test/unit and test/integration.

- src/
  - app.ts — Fastify plugin and route setup
  - server.ts — MongoDB/Redis bootstrap, listen, graceful shutdown
  - docs/
    - hmac-interceptor.ts — Swagger UI request interceptor that signs HMAC in development
    - response-descriptions.ts — OpenAPI response descriptions and docs transforms
  - config/
    - environment.ts — dotenv loading and validated application config
    - env-validation.ts — Zod check of NODE_ENV, PORT, ENABLE_CSRF, REDIS_ENABLED, DOCS_ENABLED
    - database.ts — Mongoose connect and disconnect
    - duration.ts — token lifetime parsing
    - keys.ts — RSA key loading and validation
    - redis.ts — optional shared ioredis client
    - trust-proxy.ts — Fastify proxy trust parsing
  - keys/
    - setup.sh — local RSA key generation helper
    - .gitkeep — generated PEM files (rsa.private, rsa.public) are ignored
  - models/
    - user.ts — user schema, password hashing, and role
    - refresh-token.ts — hashed refresh-token records and indexes
  - modules/
    - auth/ — controller, service (register/login/getMe), refresh-session
      (issueTokens, refresh, logout), routes, Zod validation
    - health/ — health route and database/Redis status
    - user/ — controller, service, routes, and serialize-user (public user allowlist)
  - plugins/
    - error-handlers.ts — global error and not-found handlers
    - security.ts — HMAC and CSRF onRequest hooks only
    - auth.ts — `authenticate` (access-token verification + revocation)
    - role.ts — `requireMinRole` (role-rank hierarchy guard)
  - routes/
    - index.ts — mount health, auth, and user feature plugins
  - socket/
    - index.ts — attach Socket.IO, optional Redis adapter, close lifecycle
    - auth-middleware.ts — authenticate socket handshakes
    - hmac-middleware.ts — verify socket handshake signature
    - events.ts — event names and shared payload identifiers
  - types/
    - index.ts — AppError and environment config
    - auth.ts — roles, ROLE_RANK, JWT payloads, tokens, Mongoose document types
    - pagination.ts — pagination metadata types
    - fastify-schema.d.ts — docsResponses/docsBodyOptional route schema augmentation
  - utils/
    - cache.ts — optional Redis cache helpers
    - cookie.ts — auth cookie serialization
    - hmac.ts — canonical signature compute/verify
    - jwt.ts — JWT sign/verify and token hashes
    - logger.ts — application logger
    - map-database-error.ts — Mongoose/Mongo error mapping
    - pagination.ts — offset pagination parsing and metadata
    - password.ts — password strength and bcrypt helpers
    - redis-ready.ts — Redis connection readiness helper
    - socket-emit.ts — optional Socket.IO emissions
    - token-lifetimes.ts — parsed configured expiries
    - token-revocation.ts — optional Redis revocation records
- test/
  - global-setup.ts — disposable MongoDB server
  - setup.ts — test environment, RSA keypair, and collection cleanup
  - unit/ — utils, config, error/CSRF/auth/role hooks, validation schemas,
    socket units, graceful shutdown
  - integration/ — auth, user, and health routes through app.inject();
    auth service and refresh-session rotation/reuse; Socket.IO handshake;
    Redis-outage behavior
  - helpers/ — HMAC signers (sign-request.ts, hmac-sign.ts), signed-request
    inject client, create-test-user factory

The docs/ folder follows the same topic-index pattern used by the other backend
templates.
