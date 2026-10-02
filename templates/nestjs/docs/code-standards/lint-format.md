# Lint, Format & Test

Back to [Code Standards](../code-standards.md).

## Tooling at a glance

- **Lint:** ESLint (flat config) — correctness + import ordering.
- **Format:** Prettier (`pnpm format`). `eslint-config-prettier` disables ESLint
  rules that would conflict with Prettier, so the two never fight.
- **Type checking:** `tsc --noEmit`.
- **Tests:** Vitest (transpiled with `unplugin-swc`, not esbuild).

## ESLint flat config

`eslint.config.mjs` composes:

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-perfectionist` for import ordering
- `eslint-config-prettier` last, to defer formatting to Prettier

Active rules on `src/**/*.ts`:

| Rule                                               | Setting                            | Effect                                                        |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `@typescript-eslint/no-unused-vars`                | `error`, `argsIgnorePattern: "^_"` | No unused vars; prefix intentionally-unused args with `_`.    |
| `@typescript-eslint/explicit-function-return-type` | `warn`                             | Annotate function/method return types.                        |
| `@typescript-eslint/no-extraneous-class`           | `off`                              | NestJS modules/DTO classes are often metadata-only — allowed. |
| `perfectionist/sort-imports`                       | `warn`                             | Imports sorted by **syntax kind**, then alphabetically.       |

Tests (`src/**/*.spec.ts`, `test/**/*.ts`) relax two rules: `no-explicit-any`
and `explicit-function-return-type` are **off** — terse mocks are allowed there.
`dist/` and `node_modules/` are ignored.

### Import ordering

`perfectionist/sort-imports` orders imports by **kind**, not by source path:

1. named value imports — `import { X } from "x"`
2. type imports — `import type { X } from "x"`
3. default imports — `import X from "x"`
4. side-effect imports — `import "x"`

Within each group, alphabetical ascending. Let `--fix` (or save) sort them.

## Scripts

Run with **pnpm** (recommended; npm/yarn/bun work identically):

```bash
pnpm lint          # eslint "src/**/*.ts"
pnpm lint:fix      # eslint "src/**/*.ts" --fix
pnpm format        # prettier --write .
pnpm format:check  # prettier --check .
pnpm typecheck     # tsc --noEmit -p tsconfig.json
pnpm test          # vitest run
pnpm test:watch    # vitest (watch mode)
pnpm test:coverage # vitest run --coverage
```

Run `lint`, `format:check`, and `typecheck` clean, and `test` green, before
opening a PR.

## Testing with Vitest

`vitest.config.ts` runs tests under SWC (`globals: true`):

- **Why SWC, not esbuild** — NestJS constructor DI relies on
  `emitDecoratorMetadata`. Vitest's default esbuild transform drops that
  metadata, so providers fail to resolve. `unplugin-swc` re-emits it
  (`legacyDecorator: true`, `decoratorMetadata: true`). `vite-tsconfig-paths`
  honours the `@/*` alias. Removing either breaks DI in tests.
- **Test files** — all under `test/`: `test/unit/*.spec.ts` (unit) and
  `test/e2e/*.e2e-spec.ts` (e2e). The vitest `include` also globs `src/**` in
  case a spec is co-located later; none are today.
- **In-memory MongoDB** — `test/global-setup.ts` starts `mongodb-memory-server`
  once and hands its URI to workers through vitest `provide`/`inject` (per run, so
  concurrent `pnpm test` runs never share a database); `test/setup.ts` injects it, sets env
  vars, and wires mongoose lifecycle hooks. E2E specs boot a real Nest app and
  drive it with `supertest` (HTTP) and `socket.io-client` (WebSocket). No
  external services required.
- **Serial execution** — `fileParallelism: false` so the in-memory Mongo binary
  lock is never contested between forks.
- **Coverage** — `v8` provider over `src/**/*.ts`, excluding `*.spec.ts` and
  `src/main.ts` (bootstrap wiring).

New behavior must ship with tests. HMAC-signed requests in e2e are produced by
`test/helpers/sign-request.ts`, which byte-matches `HmacService` (proven by
`test/unit/hmac-signer-parity.spec.ts`).

## Real-Redis lane

`pnpm test:redis` runs `test/redis/*.redis.ts` against a real Redis (`vitest.redis.config.ts`);
the default `pnpm test` never touches it. Set `REDIS_URL` to a **disposable** Redis, for example
`REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis`; without it the lane prints a skip message and exits 0.
It boots two app copies on one Redis and proves: rate-limit counters are shared (limit hit on A,
429 on B), a logout on A revokes the access token on B, and a Redis outage (a TCP proxy that is cut
and restored) fails open and resumes counting. Each test clears the `{default|auth|login:…}` throttler and
`revoked:user:*` keys first. CI runs it in the `backend-redis` job with a Redis service container.

The lane deletes keys (via `SCAN`), so it refuses to run unless the `REDIS_URL` host is `127.0.0.1`,
`localhost` or `::1`: the suite fails with a message naming the variable, it does not skip. Set
`REDIS_TEST_ALLOW_REMOTE=true` to accept a remote disposable Redis (never a shared or production one).
The outage scenario forwards the URL's password and database number through its proxy; `rediss://` (TLS)
URLs are not supported by the lane.
