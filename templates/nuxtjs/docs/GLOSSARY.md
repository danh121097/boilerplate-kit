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

# Stack Terms

Technical terms specific to this Nuxt 4 template's service layer and UI.

## SSR Guard / `isClient`

A check that browser-only globals exist before touching them. The token store
gates every `localStorage` access behind `isClient()`
(`typeof window !== "undefined" && typeof localStorage !== "undefined"`); during
server rendering reads return `null` and writes no-op, keeping the code SSR-safe
(`app/services/core/auth-token-storage.ts`).

## `runtimeConfig`

Nuxt's runtime configuration object. Secrets and per-env values (e.g.
`appEndpoint`, `apiPrefix`, `hmacSecret`, `buildVersion`) are declared under
`runtimeConfig.public` in `nuxt.config.ts` and read at request scope via
`useRuntimeConfig()` — never from `import.meta.env`. `public.*` values are
client-readable; non-public keys stay server-only.

## Single-Flight Refresh

A concurrency guard that collapses a burst of concurrent token refreshes into one
network call. `RefreshTokenManager` holds an `inFlight` promise per service: the
first 401 starts the refresh, every concurrent caller awaits the same promise,
then all retry with the new token (`app/services/core/refresh-token-manager.ts`).

## 401 Replay

The response-interceptor flow that transparently retries a request that failed
with `401`: refresh the access token (single-flight), then replay the original
request once. A `_retry` flag prevents a second 401 from looping forever; the
token is cleared only on an actual auth failure
(`app/services/core/interceptors.ts`).

## Envelope

The standard API response shape `{ status, data, message?, error_code? }`
(`ApiResponse<T>` in `app/services/core/types.ts`). Service methods unwrap the
envelope and return `data` to callers (e.g. `serverApiGet` returns the `data` payload).

## HMAC Canonical String

The exact, ordered string both client and server hash to verify a request. The
client builds `[method, contentType, ctime, path, ""].join("\n")` and signs it
with HMAC-SHA256 (base64). The server must reconstruct the identical string to
validate the `sig` header (`app/services/core/hmac-signature.ts`).

## Bearer Token vs httpOnly Refresh Cookie

Two distinct credentials. The short-lived **access token** is a `Bearer` token
managed client-side (stored per service, attached via the `Authorization`
header). The long-lived **refresh token** lives in an **httpOnly cookie** owned by
the backend — never readable by JS; the refresh endpoint rotates it server-side.

## Model / Api

The two service-layer base classes. `Api` (`app/services/core/api.ts`) is the
low-level axios wrapper: per-service base URL registry, request routing,
credentials, header merging. `Model` (`app/services/core/model.ts`) is the
domain base: `Model.setup` wires a `path`, a `service`, and an `Api` instance
onto a subclass, isolating config per subclass.

## `defineQuery` / `defineMutation`

Typed factories over TanStack Vue Query (`app/services/core/tanstack.ts`).
`defineQuery` produces a reusable query definition exposing a `key` and a
`queryKey(params)` builder (param-less → `[key]`, parameterized → `[key, params]`).
`defineMutation` produces a mutation definition with a `key` and optional
`invalidates` list that refetches related queries on success.
