# Lint & Format

The actual setup from `eslint.config.ts` and `prettier.config.ts`. ESLint owns
correctness + import ordering; Prettier owns formatting (`eslint-config-prettier`,
pulled in by `@nuxt/eslint`, disables stylistic rules that would conflict).

## Scripts

```bash
pnpm lint          # eslint .
pnpm format        # prettier --write .
pnpm typecheck     # nuxt typecheck
pnpm build         # nuxt build
```

## ESLint (flat config)

`eslint.config.ts` wraps Nuxt's generated config with `withNuxt(...)`:

- `withNuxt` from `./.nuxt/eslint.config.mjs` — the `@nuxt/eslint` module's flat
  preset (JS + TypeScript + Vue rules, Nuxt-aware globals).
- `eslint-plugin-perfectionist` registered for import sorting.
- A few Vue rules relaxed, plus a per-path override for the service layer.

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

### Service-layer override

For `app/services/core/**/*.ts`, `@typescript-eslint/no-extraneous-class` is
turned off — the service layer intentionally uses static-only classes (`Model`
as a base class, namespaced static utility helpers).

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

## Auto-imports & generated files — do not edit

Nuxt auto-imports a lot, so most files need no manual import:

- Vue APIs (`ref`, `computed`, `watch`, …) and Nuxt composables
  (`useRuntimeConfig`, `useState`, …).
- `@vueuse/core` (via `@vueuse/nuxt`), Pinia helpers (`storeToRefs`,
  `defineStore`), and `useI18n` (via `@nuxtjs/i18n`).
- Everything in `app/composables/**` and `app/utils/**`.
- Components under `app/components/**` (with path-derived prefixes, e.g.
  `<UiButton>`).

Generated artifacts live under `.nuxt/` (`nuxt prepare` / `postinstall` rebuilds
them) and must not be hand-edited — `.nuxt/eslint.config.mjs` and
`.nuxt/tsconfig.json` among them.

Pinia stores are the deliberate exception: `storesDirs: []` disables Pinia
auto-import, so import stores explicitly from `@/stores/...`.

## Before committing

1. `pnpm format` — apply Prettier.
2. `pnpm lint` — no errors (warnings like import order should be cleaned up).
3. `pnpm typecheck` — passes.
4. `pnpm test` — passes (run before pushing).
