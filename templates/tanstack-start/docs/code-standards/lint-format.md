# Lint and Format

## ESLint

Flat config via `eslint.config.ts` (loaded by jiti at runtime — no transpile step needed).

Active rule sets:
- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-perfectionist` — import sort by kind (named → type → default → side-effect)
- `eslint-plugin-react-hooks` recommended
- `eslint-config-prettier` — disables formatting rules that conflict with Prettier

Run: `pnpm lint`

## Prettier

Config in `prettier.config.ts`:

```ts
{ semi: true, singleQuote: false, trailingComma: "all", printWidth: 100, tabWidth: 2 }
```

Run: `pnpm format`

## Import order (perfectionist)

Imports are sorted by syntax kind, not source path:

1. Named value imports: `import { X } from "x"`
2. Type imports: `import type { X } from "x"`
3. Default imports: `import X from "x"`
4. Side-effect imports: `import "x"`

Within each group, alphabetical order ascending.
