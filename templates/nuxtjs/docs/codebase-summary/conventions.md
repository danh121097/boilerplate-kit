# Conventions

Patterns that keep this Nuxt 4 starter consistent. Match them when adding code.

## The `@/` alias → `app/`

Imports use `@/`, which resolves to the Nuxt `srcDir` (`app/`):

```ts
import { Api, ApiInterceptors } from "@/services/core";
import { useStorageKeys } from "@/enums/storage-keys";
import { useCounterStore } from "@/stores/counter";
```

This is the default Nuxt 4 alias (configured by Nuxt; `tsconfig.json` extends
`.nuxt/tsconfig.json`). No manual path setup needed.

## Barrel `index.ts` exports

Each feature folder re-exports its public surface so callers import from the
folder, not deep files:

- `app/services/index.ts` → re-exports `auth`, `core`, `users`.
- `app/services/core/index.ts` → re-exports every core module.
- `app/services/auth/index.ts`, `app/services/users/index.ts` → model + types.
- `app/enums/index.ts` → `socket-events` + `storage-keys`.

Prefer `import { ... } from "@/services/core"` over `@/services/core/api`.
(Exception: the init plugin imports `registerServiceToken` from its exact module.)

## Nuxt auto-imports — what is and isn't automatic

Automatic (no import line needed):

- **Vue/Nuxt APIs** — `ref`, `computed`, `useRuntimeConfig`, `defineNuxtPlugin`,
  `onMounted`, `useTemplateRef`, etc.
- **`@vueuse/nuxt`** — `useThrottleFn`, `storeToRefs`, …
- **i18n** — `useI18n()` (from `@nuxtjs/i18n`).
- **`app/utils/**`** — `cn`, `formatDate`, `fromNow`.
- **`app/components/**`** — auto-imported with a **path-derived prefix**:
  `app/components/ui/Button.vue` → `<UiButton>`, `Input.vue` → `<UiInput>`,
  `VeeInput.vue` → `<UiVeeInput>`, etc.

Explicit imports (by project rule):

- **Pinia stores** — `pinia.storesDirs: []` disables store auto-import; always
  `import { useXStore } from "@/stores/x"`.
- **Composables, services, enums, domain types** — imported via `@/` + barrels.

## Enums registry

Centralize string keys / event names so renames ripple cleanly:

- **`app/enums/storage-keys.ts`** — `useStorageKeys("AUTH_TOKEN" | "LANGUAGE" |
  "THEME")` returns a key prefixed by `NUXT_PUBLIC_APP_NAME` (fallback
  `PRISM_APP`). Resolved lazily inside the accessor (the prefix needs
  `useRuntimeConfig()`, valid only in a request scope) and cached. Always go
  through it instead of hard-coding `localStorage` strings.
- **`app/enums/socket-events.ts`** — `SOCKET_EVENT` map +
  `SOCKET_UNAUTHORIZED_MESSAGE`; reference these instead of raw event strings.

## SSR safety

- Guard `window`/`localStorage`/`document` (see `isClient()` in
  `auth-token-storage.ts`; `reloadPage()` in `interceptors.ts`).
- Read env via `useRuntimeConfig()` in a request scope — never `import.meta.env`
  or module top-level reads.
- Browser-only work (Socket.IO connect, ripple effects) goes in `onMounted`.

## Filenames

- **kebab-case** for `.ts` files with descriptive names
  (`refresh-token-manager.ts`, `auth-token-storage.ts`).
- **Composables** are the exception: filename = the exact `useXxx` function name
  (`useSocketIO.ts`).
- **Components** are PascalCase `.vue` under `app/components/`.

## `<script setup>` order & props

Strict ordering: imports → types → `defineProps`/`defineEmits` → composables →
`const` → refs → computed → functions → lifecycle. Always extract
`interface Props` / `interface Emits` above `defineProps<Props>()` — never inline
the type literal (see `components/ui/Button.vue`, `VeeInput.vue`).

## File size

Aim for ≤ ~200 LOC per file; split early into focused modules (the core service
layer is already decomposed: `api`, `interceptors`, `refresh-token-manager`,
`auth-refresh-client`, `headers-utils`, `hmac-signature`, …).

## Related

- [Directory Structure](./directory-structure.md)
- [Services & Stores](./services-and-stores.md)
- [../code-standards.md](../code-standards.md)
