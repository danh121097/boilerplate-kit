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

| Rule | Setting | Effect |
| --- | --- | --- |
| `@typescript-eslint/no-unused-vars` | `error`, `argsIgnorePattern: "^_"` | No unused vars; prefix intentionally-unused args with `_`. |
| `@typescript-eslint/explicit-function-return-type` | `warn` | Annotate function/method return types. |
| `@typescript-eslint/no-extraneous-class` | `off` | NestJS modules/DTO classes are often metadata-only — allowed. |
| `perfectionist/sort-imports` | `warn` | Imports sorted by **syntax kind**, then alphabetically. |

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
- **Test files** — `src/**/*.spec.ts` (co-located unit specs),
  `test/**/*.spec.ts` (unit), `test/**/*.e2e-spec.ts` (e2e).
- **In-memory MongoDB** — `test/global-setup.ts` starts `mongodb-memory-server`
  once and writes the URI to a temp file; `test/setup.ts` reads it, sets env
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
