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

# Stack Terms (Vue 3 Template)

## Single-Flight Refresh

A concurrency guard where many simultaneous token-refresh requests collapse into
one in-flight refresh; all callers await the same promise and receive the same
new token. Implemented by `RefreshTokenManager` and exercised by both the manager
unit tests and the interceptor integration tests.

## Envelope

The standard backend response wrapper `{ success, data, ... }`. The axios response
interceptor unwraps it so callers (Models) read the inner `data` directly instead
of digging through the wrapper on every call.

## HMAC Canonical String

The exact newline-joined string the client signs and the server independently
re-builds to verify a request: `METHOD\nContent-Type\nctime\npath\n`
(uppercase method, leading-slash-normalized path, trailing empty segment). Signed
with HMAC-SHA256 and base64-encoded; both sides must build the identical string.

## Bearer Token vs httpOnly Refresh Cookie

Two different credentials. The **bearer (access) token** is a short-lived token
sent in the `Authorization: Bearer <token>` header and stored client-side. The
**refresh token** is delivered/returned via an httpOnly cookie (requests use
`withCredentials`), is not readable by JS, and is used only to mint a new access
token when the bearer expires (401).

## Model

A class-based data-access wrapper (subclass of `Model`) configured via
`Model.setup({ path, service })`. Each Model owns its own `Api` instance and
exposes domain methods (e.g. `AuthModel.login`).

## Api

The per-service HTTP client wrapper around axios. Resolves a base URL from a
per-service registry (`MAIN` default), attaches credentials/headers, and exposes
`get` / `post` / `postFormData`. Multiple services (e.g. `MAIN`, `ADMIN`) each
route to their own base URL.

## Service (slot)

A named backend target (e.g. `MAIN`, `ADMIN`). Both the base-URL registry and the
token storage are keyed by service so multiple backends coexist; unknown services
fall back to the `MAIN` slot.

## defineQuery / defineMutation

Thin factories over TanStack Vue Query that pair a stable `key` with a
fetcher/mutator and produce typed query keys (`[key]` or `[key, param]`),
standardizing read (query) and write (mutation) hooks.

## Barrel

An `index.ts` that re-exports a module's public surface (e.g. `@/services/core`),
so consumers import from one path instead of reaching into individual files.
