# File Naming

Self-documenting names so Grep/Glob find the right file without opening it.

## TypeScript (`.ts`) — kebab-case

Use kebab-case with a meaningful, descriptive name. Long is fine if it is clear.

```
src/services/core/auth-token-storage.ts
src/components/ui/input.props.ts
src/stores/socket-io.ts
```

## Composables — camelCase (the exception)

A composable file is named **exactly** after its `useXxx` function. This is the
one place where camelCase wins over kebab-case, so the filename matches the
exported symbol one-to-one.

```
src/composables/useSocketIO.ts   ->  export function useSocketIO() {}
```

## Components (`.vue`) — PascalCase

Single-file components use PascalCase, matching the tag name used in templates.

```
src/components/ui/VeeInput.vue   ->  <VeeInput name="email" />
src/components/ui/Input.vue      ->  <Input v-model="value" />
```

Views are the deliberate exception — route-level screens in `src/views/` use
kebab-case (`form-view.vue`, `home-view.vue`) since they are referenced by the
router, not used as in-template tags.

## Folder + barrel layout

Each cohesive folder exposes a barrel `index.ts` that re-exports its public API.
Import from the folder, never from deep internal paths.

```
src/services/
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

Barrels exist for `services/`, `services/core`, `services/auth`, `services/users`,
`enums/`, `utils/`, `directives/`, `plugins/`, `router/`.

## File size — ≤ ~200 LOC

Keep each file under ~200 lines for readability and review. When a file grows:

- Split a large component into smaller child components (composition over size).
- Extract types into a sibling `*.props.ts` / `types/*.ts` (see `input.props.ts`).
- Move reusable logic into a `composables/useXxx.ts`.
- Move business logic into a service/model class under `services/`.

Markdown, config, and env files are exempt from the LOC limit.
