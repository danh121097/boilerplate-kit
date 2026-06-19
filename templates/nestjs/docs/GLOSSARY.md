> **Note — boilerplate template:** This harness ships **markdown-first**. The
> SQLite durable layer and the Rust `harness-cli` (`scripts/bin/harness-cli ...`)
> are **optional**; the `docs/*.md` files are the source of truth. To enable the
> CLI later, install repository-harness:
> `curl -fsSL https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh | bash -s -- --merge --yes`
> Treat any `scripts/bin/harness-cli` example below as optional until then.

# Glossary

## Agent

An AI coding collaborator operating inside the repository.

## Harness

The repo-level operating system that tells humans and agents how to turn intent
into safe product changes.

## Product Contract

The current expected behavior of the product. Product docs plus executable tests
become the living contract once implementation exists.

## Story Packet

A story-sized work file or folder that describes the product contract, affected
docs, design notes, and validation expectations for a feature.

## Feature Intake

The classification step that turns a prompt into tiny, normal, or high-risk
work before implementation begins.

## Component Taxonomy

A map from Harness files and capabilities to the responsibilities they serve,
used to evaluate coverage, attribute failures, and identify missing harness
capabilities.

## Maturity Level

A verifiable stage in Harness capability, from H0 bare environment through H5
self-improving harness. Each level has required files, criteria, and benchmark
indicators.

## Trace Quality Tier

The expected depth of a task trace: minimal for tiny work, standard for normal
work, and detailed for high-risk work.

## Verification Gate

An advisory Harness check that runs or inspects mechanical proof before a task
is closed. In Phase 4, `story verify <id>` executes a story's `verify_command`,
and `trace --story <id>` warns when that story's verification has not passed.

## Context Phase

A phase of an agent task that changes what context should be read, such as
intake, planning, implementation, validation, or trace recording.

## Retrieval Trigger

A condition that tells an agent to fetch additional context, such as touching a
database schema, changing a public contract, or discovering missing validation.

## Harness Delta

A documentation, template, validation, backlog, or decision update that makes
future agent work safer or easier.

## Backlog Outcome Loop

The feedback workflow for Harness improvements: record predicted impact when a
backlog item is created, then record actual measured outcome when the item is
closed so future agents can compare expectation with result.

## Durable Layer

The SQLite database and CLI (`scripts/bin/harness-cli`) that stores operational records
(intakes, stories, decisions, backlog items, traces) as structured, queryable
data. Policy docs describe how to work; the durable layer stores what happened.

## Product Delta

A product-facing change such as code, tests, API shape, data model, or product
documentation.

## Trace

A structured record of what an agent did during a task: actions taken, files
read, files changed, decisions made, errors encountered, outcome, and any
harness friction discovered.

---

# Backend Stack Terms

## SecurityGuard

The single composite NestJS guard (`src/common/guards/security.guard.ts`)
registered as an `APP_GUARD`. It runs a fixed, deterministic sequence on every
request: **HMAC → origin/CSRF → JWT → role**. One composite guard guarantees
ordering regardless of `APP_GUARD` array position (which NestJS does not order).
Mirrors the four concerns an Express middleware chain would handle.

## HMAC Canonical String

The exact byte string both client and server sign for request integrity:
`[METHOD, contentType, ctime, path, ""].join("\n")` (trailing empty element
yields a final newline). Signed HMAC-SHA256, Base64-encoded. Defined in
`HmacService` (`src/common/hmac.service.ts`); enforced for **every** request by
the HMAC step of `SecurityGuard`.

## Path Derivation

`setGlobalPrefix` does **not** strip the API prefix from `req.originalUrl` inside
a guard (unlike Express `app.use(prefix, …)` which pre-strips it). The
`derivePath(originalUrl, apiPrefix)` helper in `SecurityGuard` strips the query
string and the prefix so the signed `path` matches what the client sent
(`/api/v1/auth/login?x=1` → `/auth/login`).

## Refresh-Token Rotation & Reuse Detection

On each `POST /auth/refresh`, the presented refresh token is revoked and a brand
-new access + refresh pair is issued (`AuthService.refresh`). If a token that was
**already revoked** is replayed, reuse is detected: every refresh token for that
user is revoked and a user-level access-token cutoff is recorded, forcing a fresh
login (`src/modules/auth/auth.service.ts`).

## httpOnly Cookie

A cookie inaccessible to JavaScript (`document.cookie`), set with the `HttpOnly`
flag. Used for `accessToken` and `refreshToken` so XSS cannot read them
(`src/common/cookie.util.ts`).

## AppException

The application's typed exception (`src/common/exceptions/app.exception.ts`),
extending Nest's `HttpException`, carrying `message`, `statusCode`, and
`errorType`. Thrown anywhere in the stack and normalized by
`HttpExceptionFilter` into `{ success, status, errorType, message, error_code,
error_message }`.

## @Controller / Decorated Routes

Routes are declared with NestJS decorators (`@Controller('auth')`, `@Post('login')`,
`@Get('me')`) on controller methods — Nest's metadata-driven router wires them.
Adding a controller to its feature module's `controllers` array is the only
registration step. There is no manual route registry.

## @Public / @Roles

Route metadata decorators read by `SecurityGuard`. `@Public()`
(`IS_PUBLIC_KEY`) marks a route as not requiring a JWT (HMAC still applies).
`@Roles('admin')` (`ROLES_KEY`) sets the minimum role rank; the role step
enforces the `ROLE_RANK` hierarchy after JWT identity is established.

## ZodValidationPipe

The global validation pipe (registered as `APP_PIPE` in `CommonModule`,
re-exported from `nestjs-zod`). DTO classes built with `createZodDto(schema)`
are validated automatically; failures become a `VALIDATION_ERROR` (400) in the
standard envelope. The same Zod schema also feeds the Swagger/OpenAPI document.

## apiPrefix

The base path all API routes mount under (`API_PREFIX`, default `/api/v1`),
applied via `app.setGlobalPrefix(...)` in `main.ts`. The throttler counts and
the HMAC step both account for it (HMAC via `derivePath`).

## Token Revocation

A user-level cutoff timestamp (stored in Redis when enabled) recorded on
logout / refresh-reuse. The JWT step of `SecurityGuard` rejects any access token
whose `iat` predates the cutoff, invalidating still-valid JWTs early. No-op and
fail-open when Redis is off (`src/common/token-revocation.service.ts`).

## RSA Keys

The asymmetric key pair (private/public) used to sign and verify JWT **access**
tokens with RS256 — the private key signs, the distributable public key verifies.
Loaded + self-tested at startup by `AppConfigService` (`src/config/keys.ts`); the
algorithm is pinned to RS256 to prevent `alg` downgrade forgery
(`src/common/token.service.ts`). Generate keys with `pnpm keys` (portable Node
script) or `src/keys/setup.sh` (openssl).

## JWT_REFRESH_SECRET

The symmetric secret (≥ 32 chars, required at boot) used to sign and verify JWT
**refresh** tokens with HS256. A symmetric secret is correct here because refresh
tokens are only ever verified by this auth server — never handed to a third
party. The algorithm is pinned to HS256 to prevent `alg` downgrade forgery. The
`token_use` claim ("access" vs "refresh") means a refresh token can never pass
access verification (`src/common/token.service.ts`).

## RedisIoAdapter

A custom Socket.IO adapter (`src/realtime/redis-io.adapter.ts`) installed in
`main.ts` only when `REDIS_ENABLED=true`. It wires the
`@socket.io/redis-adapter` pub/sub so emits reach clients across instances. The
shared pub client is owned by `RedisModule`; the adapter duplicates it for the
sub connection.
