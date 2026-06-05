# File Naming

Self-documenting names so Grep/Glob find the right file without opening it.

## TypeScript (`.ts`) — kebab-case

Use kebab-case with a meaningful, descriptive name. Long is fine if it is clear.

```
app/services/core/auth-token-storage.ts
app/components/ui/input.props.ts
app/stores/socket-io.ts
app/enums/storage-keys.ts
```

## Composables — camelCase (the exception)

A composable file is named **exactly** after its `useXxx` function. This is the
one place where camelCase wins over kebab-case, so the filename matches the
exported symbol one-to-one.

```
app/composables/useSocketIO.ts   ->  export function useSocketIO() {}
```

Everything in `app/composables/**` is auto-imported by Nuxt — no manual import.

## Components (`.vue`) — PascalCase

Single-file components use PascalCase. Nuxt auto-imports every file under
`app/components/**` with a **path-derived prefix**, so a component's tag includes
its folder name:

```
app/components/ui/Button.vue   ->  <UiButton />
app/components/ui/VeeInput.vue ->  <UiVeeInput name="email" />
app/components/ui/Card.vue     ->  <UiCard>
```

No explicit `components:` config is needed (see `nuxt.config.ts`).

## Pages & layouts — kebab-case routes

`app/pages/*.vue` map to file-based routes — keep the filename kebab-case as it
becomes the URL segment (`app/pages/users.vue` -> `/users`). Layouts live in
`app/layouts/` (`default.vue`).

## `app/` srcDir + barrel layout

Source lives under `app/` (Nuxt 4 default srcDir). Each cohesive folder exposes a
barrel `index.ts` that re-exports its public API. Import from the folder, never
from deep internal paths.

```
app/services/
├── core/
│   ├── tanstack.ts
│   ├── auth-token-storage.ts
│   └── index.ts        # re-exports defineQuery, defineMutation, Model, ...
├── auth/
│   ├── auth.ts
│   ├── types/auth.ts
│   └── index.ts
└── index.ts            # re-exports core + auth + users
```

```ts
// Good — via barrel + @/ alias
import { defineMutation, defineQuery, Model } from "@/services/core";

// Avoid — deep path, bypasses the barrel
import { defineMutation } from "@/services/core/tanstack";
```

The `@/` alias maps to `app/`. Barrels exist for `services/`, `services/core`,
`services/auth`, `services/users`, and `enums/`.

## File size — ≤ ~200 LOC

Keep each file under ~200 lines for readability and review. When a file grows:

- Split a large component into smaller child components (composition over size).
- Extract types into a sibling `*.props.ts` / `types/*.ts` (see `input.props.ts`).
- Move reusable logic into a `composables/useXxx.ts`.
- Move business logic into a service/model class under `services/`.

Markdown, config, and env files are exempt from the LOC limit.
