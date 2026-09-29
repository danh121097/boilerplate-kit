# Lint and Format

## ESLint

Flat config via `eslint.config.ts`, with type-aware linting
(`parserOptions.projectService`).

Active rule sets:
- `@eslint/js` recommended
- `typescript-eslint` recommended; unused vars/args prefixed with `_` are allowed
- `eslint-plugin-perfectionist` — import sort by kind (named → type → default → side-effect)
- `eslint-plugin-react-hooks` recommended
- `local/sort-leading-declarations` (`eslint-rules/`) — orders a function's
  leading declarations: `let` → plain `const` (values before functions) →
  object destructuring → array destructuring
- `eslint-config-prettier` — disables formatting rules that conflict with Prettier

Ignored: `.next/`, `node_modules/`, `next-env.d.ts`, `**/*.d.ts`.

## Prettier

Config in `prettier.config.ts`:

```ts
{ semi: true, singleQuote: false, trailingComma: "all", printWidth: 100, tabWidth: 2, useTabs: false }
```

## Scripts

| Script | Does |
|--------|------|
| `pnpm lint` | `eslint . --fix && prettier --write .` |
| `pnpm lint:check` | `eslint . && prettier --check .` (CI) |
| `pnpm format` | `prettier --write .` |
| `pnpm typecheck` | `tsc --noEmit` |

## Import order (perfectionist)

Imports are sorted by syntax kind, not source path:

1. Named value imports: `import { X } from "x"`
2. Type imports: `import type { X } from "x"`
3. Default imports: `import X from "x"`
4. Side-effect imports: `import "x"`

Within each group, alphabetical order ascending.
