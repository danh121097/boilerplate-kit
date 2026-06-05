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

## HMAC Canonical String

The exact byte string both client and server sign for request integrity:
`[METHOD, contentType, ctime, path, ""].join("\n")` (trailing empty element
yields a final newline). Signed HMAC-SHA256, Base64-encoded. Defined in
`src/utils/hmac.ts`; verified by `verifyHmacRequest` (`src/middleware/hmac.ts`)
for every route under `apiPrefix`.

## Refresh-Token Rotation

On each `/auth/refresh`, the presented refresh token is revoked and a brand-new
access + refresh pair is issued. A stolen-and-reused old token is rejected,
limiting the blast radius of token theft (`src/modules/auth/service.ts`).

## httpOnly Cookie

A cookie inaccessible to JavaScript (`document.cookie`), set with the
`HttpOnly` flag. Used for `accessToken` and `refreshToken` so XSS cannot read
them (`src/utils/cookie.ts`).

## AppError

The application's typed error class carrying `message`, `statusCode`, and
`errorType`. Thrown anywhere in the stack and normalized by the global error
handler into `{ success, status, message, error_code, error_message }`.

## RouteGroup

A declarative description of a feature's routes (`prefix` + array of
`{ method, path, middleware, handler }`). Turned into an Express Router by
`registerGroup` (`src/utils/route-registrar.ts`); registered in
`src/routes/index.ts`. Adding a module's RouteGroup there is the only place a
new route group is declared.

## apiPrefix

The base path all API routes mount under (`API_PREFIX`, default `/api/v1`).
HMAC and the global rate limiter are applied at this mount point, so every
route inherits them (`src/config/environment.ts`, `src/app.ts`).

## Token Revocation

A user-level cutoff timestamp (stored in Redis when enabled) recorded on
logout/ban. `authenticate` rejects any access token whose `iat` predates the
cutoff, invalidating still-valid JWTs early. No-op when Redis is off
(`src/utils/token-revocation.ts`).

## RSA Keys

The asymmetric key pair (private/public) used to sign and verify JWT access
tokens with RS256. Loaded at startup by `loadRsaKeyPair`; the algorithm is
pinned to RS256 to prevent `alg` downgrade forgery (`src/config/keys.ts`,
`src/utils/jwt.ts`).
