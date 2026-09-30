# Conventions

Structural patterns used across this Fastify backend.

## Imports and modules

Use the @/ alias for src imports. Types are kept in src/types/; route plugins
are exported from feature folders and registered from src/routes/index.ts.
Controller modules use namespace imports for their handlers.

## Errors

Throw AppError from services and controllers. src/plugins/error-handlers.ts
converts it and framework errors into the standard error envelope. Avoid
hand-written error responses in feature code. See
[error-handling.md](../system-architecture/error-handling.md).

## Validation and schemas

Declare Zod schemas on Fastify routes. fastify-type-provider-zod installs
request validation and response serialization and Swagger's transform reads the
same schemas. Do not duplicate validation in a separate middleware layer.

## Environment

src/config/environment.ts is the source of validated config. Feature modules
should import config instead of reading process.env directly. MONGODB_URI,
HMAC_SECRET, and JWT_REFRESH_SECRET are required. Redis is optional.

## Tokens and optional services

Access tokens use RS256 keys; refresh tokens use HS256 and are stored in
MongoDB by SHA-256 hash. Redis-backed cache, revocation, distributed rate
limits, and Socket.IO cross-instance messages are optional. Callers should use
the exported helpers rather than assume a Redis client or Socket.IO server is
always present.
