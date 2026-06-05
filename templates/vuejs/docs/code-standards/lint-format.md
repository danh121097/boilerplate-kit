# Lint & Format

The actual setup from `eslint.config.ts` and `prettier.config.ts`. ESLint owns
correctness + import ordering; Prettier owns formatting (`eslint-config-prettier`
disables any stylistic ESLint rules that would conflict).

## Scripts

```bash
pnpm lint          # eslint .
pnpm format        # prettier --write .
pnpm typecheck     # vue-tsc --noEmit
pnpm build         # vue-tsc --noEmit && vite build
```

## ESLint (flat config)

`eslint.config.ts` composes, in order:

- `@eslint/js` recommended
- `typescript-eslint` recommended
- `eslint-plugin-vue` `flat/recommended`
- `.vue` files: `<script lang="ts">` parsed with the TypeScript parser
- `eslint-plugin-perfectionist` for import sorting
- `eslint-config-prettier` last (turns off conflicting style rules)

`dist/`, `auto-imports.d.ts`, and `components.d.ts` are ignored.

### Import sorting by syntax kind (perfectionist)

`perfectionist/sort-imports` (level `warn`) orders imports by **kind, not by
source path**. Custom groups outrank predefined ones, so kind order is
authoritative; within a kind, names are alphabetical ascending:

1. named value imports — `import { X } from "x"`
2. type imports — `import type { X } from "x"`
3. default imports — `import X from "x"`
4. side-effect imports — `import "x"`

```ts
import { useMutation, useQuery } from "@tanstack/vue-query"; // named value
import type { Ref } from "vue";                              // type
import HmacSHA256 from "crypto-js/hmac-sha256";              // default
import "./styles.css";                                       // side-effect
```

### Vue rules relaxed

Turned off intentionally: `vue/multi-word-component-names`, `vue/no-v-html`,
`vue/html-self-closing`, `vue/require-default-prop`.

### Auto-import globals

`unplugin-auto-import` injects `ref`, `computed`, `cn`, etc. as globals. The
config registers them from `.eslintrc-auto-import.json` as `readonly` so they do
not trip `no-undef` — do not add manual imports for these.

## Prettier (`prettier.config.ts`)

```ts
{
  semi: true,            // semicolons
  singleQuote: false,    // double quotes
  trailingComma: "all",  // trailing commas everywhere
  printWidth: 100,       // wrap at 100 cols
  tabWidth: 2,           // 2-space indent
}
```

## Generated files — do not edit

Created by the Vite plugins; git-tracked but hand-edits are overwritten on build:

- `auto-imports.d.ts` — types for auto-imported APIs (`unplugin-auto-import`).
- `components.d.ts` — types for auto-registered `src/components/ui/` components.
- `.eslintrc-auto-import.json` — the auto-import globals ESLint reads.

Auto-import scope (`vite.config.ts`): APIs from `vue`, `vue-router`,
`@vueuse/core`, `vue-i18n`, `pinia`, plus everything in `src/composables/**` and
`src/utils/**`. Components auto-register **only** from `src/components/ui`.

## Before committing

1. `pnpm format` — apply Prettier.
2. `pnpm lint` — no errors (warnings like import order should be cleaned up).
3. `pnpm typecheck` — passes.
4. `pnpm test` — passes (run before pushing).
