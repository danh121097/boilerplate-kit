# Directory Structure

This tree reflects the current template. Integration tests live in test/.

- src/
  - app.ts — Fastify plugin and route setup
  - server.ts — MongoDB/Redis bootstrap, listen, graceful shutdown
  - config/
    - environment.ts — dotenv loading and validated application config
    - database.ts — Mongoose connect and disconnect
    - duration.ts — token lifetime parsing
    - keys.ts — RSA key loading and validation
    - redis.ts — optional shared ioredis client
    - trust-proxy.ts — Fastify proxy trust parsing
  - keys/
    - setup.sh — local RSA key generation helper
    - .gitkeep — generated PEM files are ignored
  - models/
    - user.ts — user schema, password hashing, and role
    - refresh-token.ts — hashed refresh-token records and indexes
  - modules/
    - auth/ — controller, service, routes, Zod validation
    - health/ — health route and database/Redis status
    - user/ — controller, service, routes, and user serialization
  - plugins/
    - error-handlers.ts — global error and not-found handlers
    - security.ts — HMAC/CSRF hooks, access-token authentication, RBAC
  - routes/
    - index.ts — mount health, auth, and user feature plugins
  - socket/
    - index.ts — attach Socket.IO, optional Redis adapter, close lifecycle
    - auth-middleware.ts — authenticate socket handshakes
    - hmac-middleware.ts — verify socket handshake signature
    - events.ts — event names and shared payload identifiers
  - types/
    - index.ts — AppError and environment config
    - auth.ts — roles, JWT payloads, tokens, Mongoose document types
    - pagination.ts — pagination metadata types
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
  - api.test.ts — HTTP contract tests through app.inject()
  - auth-service.test.ts — refresh rotation, retry, and reuse service tests
  - global-setup.ts — disposable MongoDB server
  - setup.ts — test environment, RSA keypair, and collection cleanup
  - helpers/sign-request.ts — HMAC test signer

The docs/ folder follows the same topic-index pattern used by the other backend
templates.
