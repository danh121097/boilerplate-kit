# TypeScript and Node Patterns

Rules grounded in the current src/ tree.

## Strict TypeScript

tsconfig.json enables strict mode and targets ES2022. Use explicit types at
module boundaries, prefer unknown when a type cannot be established, and keep
the @/ alias for source imports.

## Fastify handlers

Route plugins declare Fastify schemas and attach controller handlers. A
controller reads request data, calls a service, uses reply for cookies or
status codes, and sends a success response. Services should not accept
FastifyRequest or FastifyReply; they receive plain values and operate on models.

Rejected async handlers flow to Fastify's error handler. Catch lower-level
errors only when translating them into AppError or performing cleanup before
rethrowing.

## Zod schemas

Use Zod schemas in the Fastify route's schema object. The validator compiler
validates request bodies, query values, and params; the serializer compiler
keeps documented response shapes aligned. Auth request and response schemas
live in src/modules/auth/validation.ts. User route schemas are declared in
src/modules/user/routes.ts.

## Errors

Throw AppError with statusCode and errorType for expected failures. The global
handler owns the response envelope and hides internal 5xx messages outside
development.

## Environment and keys

Read environment values through src/config/environment.ts. It loads dotenv,
validates MONGODB_URI, HMAC_SECRET, and JWT_REFRESH_SECRET, and exposes the
typed config object. RSA access-token keys are loaded from the configured paths;
development and tests may generate ephemeral keys. Use pnpm keys to generate
the local keypair.
