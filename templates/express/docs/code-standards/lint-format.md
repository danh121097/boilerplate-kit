# Lint, Format & Test

Back to [Code Standards](../code-standards.md).

## Tooling at a glance

- **Lint:** ESLint (flat config). `eslint-config-prettier` is last in the config
  so ESLint never fights the formatter.
- **Formatting:** Prettier (`prettier.config.ts`: double quotes, semicolons,
  trailing commas, 100 columns). `pnpm format` writes, `pnpm format:check` verifies.
- **Type checking:** `tsc --noEmit -p tsconfig.test.json` (source and tests).
- **Tests:** Vitest.

## ESLint flat config

`eslint.config.mjs` composes:

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-perfectionist` for import ordering

Active rules on `src/**/*.ts`:

| Rule                                               | Setting                            | Effect                                                                       |
| -------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| `@typescript-eslint/no-unused-vars`                | `error`, `argsIgnorePattern: "^_"` | No unused vars; prefix intentionally-unused args with `_` (`_res`, `_next`). |
| `@typescript-eslint/explicit-function-return-type` | `warn`                             | Annotate function return types.                                              |
| `perfectionist/sort-imports`                       | `warn`                             | Imports sorted by **syntax kind**, then alphabetically.                      |

Tests (`src/**/__tests__/**`, `*.test.ts`) relax two rules: `no-explicit-any`
and `explicit-function-return-type` are **off** — terse mocks are allowed there.
`dist/` and `node_modules/` are ignored.

### Import ordering

`perfectionist/sort-imports` orders imports by **kind**, not by source path:

1. named value imports — `import { X } from "x"`
2. type imports — `import type { X } from "x"`
3. default imports — `import X from "x"`
4. side-effect imports — `import "x"`

Within each group, alphabetical ascending. Let `--fix` (or save) sort them.

### Editor integration

`.vscode/settings.json` runs ESLint auto-fix on save
(`source.fixAll.eslint`), using the flat config. Install the recommended
extensions (`.vscode/extensions.json`) for this to work.

## Scripts

Run with **pnpm** (the project's package manager):

```bash
pnpm lint         # eslint src/**/*.ts
pnpm lint:fix     # eslint src/**/*.ts --fix
pnpm typecheck    # tsc --noEmit -p tsconfig.test.json
pnpm format       # prettier --write .
pnpm format:check # prettier --check .
pnpm test         # vitest run
pnpm test:watch   # vitest (watch mode)
pnpm test:coverage# vitest run --coverage
```

Run `lint` and `typecheck` clean, and `test` green, before opening a PR.

## Testing with Vitest

`vitest.config.ts` (`environment: 'node'`, globals on):

- Test files: `src/__tests__/unit/*.test.ts` and `src/__tests__/integration/*.test.ts`
  (shared fixtures in `src/__tests__/helpers/`), with `src/__tests__/setup.ts` as
  the setup file. The `@/` alias resolves via
  `vite-tsconfig-paths` against `tsconfig.test.json`.
- Integration tests use `supertest` (HTTP) and `mongodb-memory-server` (an
  in-memory MongoDB) — no external services required.
- **Coverage thresholds are 100%** (statements / branches / functions / lines)
  via the `v8` provider. Wiring-only files are excluded from coverage:
  `server.ts`, `app.ts`, `config/database.ts`, `config/environment.ts`,
  `routes/health-check.ts`, and everything under `__tests__/`.

New behavior must ship with tests that keep coverage at 100%. Do not lower
thresholds or exclude files to make the suite pass.

## Real-Redis lane

`pnpm test:redis` runs `src/__tests__/redis/*.redis.ts` against a real Redis (`vitest.redis.config.ts`);
the default `pnpm test` never touches it. Set `REDIS_URL` to a **disposable** Redis, for example
`REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis`; without it the lane prints a skip message and exits 0.
It boots two app copies on one Redis and proves: rate-limit counters are shared (limit hit on A,
429 on B), a logout on A revokes the access token on B, and a Redis outage (a TCP proxy that is cut
and restored) fails open and resumes counting. Each test clears the `rl:*`-style limiter and
`revoked:user:*` keys first. CI runs it in the `backend-redis` job with a Redis service container.

The lane deletes keys (via `SCAN`), so it refuses to run unless the `REDIS_URL` host is `127.0.0.1`,
`localhost` or `::1`: the suite fails with a message naming the variable, it does not skip. Set
`REDIS_TEST_ALLOW_REMOTE=true` to accept a remote disposable Redis (never a shared or production one).
The outage scenario forwards the URL's password and database number through its proxy; `rediss://` (TLS)
URLs are not supported by the lane.
