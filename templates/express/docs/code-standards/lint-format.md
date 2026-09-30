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
