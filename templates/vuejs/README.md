# Vue starter

Opinionated Vue 3 starter built with Vite. Production-grade structure mirroring a real codebase — services + plugins + i18n + form validation + UI components — kept lean enough to read in one sitting.

## Stack

| Concern       | Choice                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| Framework     | Vue 3 + `<script setup>` + TypeScript                                        |
| Bundler       | Vite (Rolldown)                                                              |
| Routing       | Vue Router                                                                   |
| Client state  | Pinia                                                                        |
| Server state  | TanStack Vue Query + `defineQuery`/`defineMutation` helpers                  |
| HTTP          | Axios + class-based `Api` + interceptors (optional HMAC signing)             |
| UI primitives | Reka UI (headless)                                                           |
| UI components | Pre-built `Button`, `Card`, `Input`, `Badge` with `class-variance-authority` |
| Styles        | Tailwind v4 + SCSS (`@tailwindcss/vite`, `sass-embedded`)                    |
| Composables   | `@vueuse/core`                                                               |
| Forms         | vee-validate + zod via `@vee-validate/zod`                                   |
| i18n          | vue-i18n (en + ja locales bundled)                                           |
| Icons         | lucide-vue-next                                                              |
| Dates         | dayjs                                                                        |
| Auto-imports  | `unplugin-auto-import` + `unplugin-vue-components`                           |
| Lint / format | ESLint flat config (TS) + Prettier (TS)                                      |

## Setup

```sh
pnpm install
pnpm dev
```

The first `pnpm dev` regenerates `auto-imports.d.ts` and `components.d.ts` — both are gitignored.

## Scripts

- `dev` — Vite dev server
- `build` — `vue-tsc --noEmit` + production Vite build
- `preview` — preview the production build
- `typecheck` — `vue-tsc --noEmit`
- `lint` — ESLint
- `format` — Prettier write

## Project layout

```
src/
├── App.vue
├── main.ts                       # bootstraps services + plugins, mounts app
├── components/
│   └── ui/                       # globally auto-imported (Button, Card, …)
│       ├── Button.vue
│       ├── button.variants.ts    # cva variants (kept beside the SFC)
│       └── …
├── composables/                  # auto-imported (no manual import)
├── directives/                   # custom v-track + index barrel
├── enums/                        # STORAGE_KEYS (prefixed by VITE_APP_NAME) + other shared enums
├── i18n/
│   └── locales/                  # en.ts, ja.ts
├── plugins/                      # pinia, vue-query, i18n, directives, index
├── router/index.ts
├── scss/
│   ├── tailwind.css              # @import "tailwindcss" + @theme tokens
│   └── main.scss                 # project SCSS resets + safe-area vars
├── services/
│   ├── core/                     # api.ts, model.ts, interceptors.ts, tanstack.ts, …
│   ├── init-services.ts          # called from main.ts before app mount
│   └── users.ts                  # domain model + `useUsersListQuery` example
├── stores/                       # Pinia — explicit imports (`import { useXStore } from "@/stores/x"`)
├── utils/                        # cn (cva merge), format (dayjs helpers) — auto-imported
└── views/                        # page-level components
```

## Auto-imports

- `vue` (`ref`, `computed`, …), `vue-router` (`useRouter`, `useRoute`), `@vueuse/core` (`useStorage`, …) auto-imported in every `<script setup>` and `.ts` file.
- Files under `src/composables/**` and `src/utils/**` auto-imported by named export. Stores stay explicit (`import { useCounterStore } from "@/stores/counter"`).
- Only `src/components/ui/**` is auto-registered as global components. Other folders under `src/components/**` (feature components, layouts, etc.) stay explicit imports so the global registry doesn't grow unbounded.
- Components in `src/components/**` auto-registered globally — drop `<Button>`, `<Card>` into any template, no import line.

## Services layer

`src/services/core/` mirrors a production setup:

- `Api` — class-based axios client with multi-service support (`MAIN` / `AUX`), lazy interceptor registration, in-flight request counter.
- `ApiInterceptors` — request interceptor injects auth + optional HMAC headers; response interceptor unwraps `{ status, data, ... }` envelopes and reloads on 401.
- `HMACSignatureGenerator` — produces `sig` / `ctime` / `x-version` headers only when `VITE_HMAC_SECRET` is set. Safe to delete if your backend doesn't sign.
- `Model` — base class for domain models; subclass and call `Model.setup({ path, service })`.
- `defineQuery` / `defineMutation` — typed wrappers around TanStack Vue Query with consistent error type.

Example domain service in `src/services/users.ts`:

```ts
export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: "/users", service: "MAIN" });
  }
  static list() {
    return this.api.get<User[]>();
  }
}
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: async () => (await UsersModel.list()).data,
});
```

## i18n

Locale stored in `localStorage.language`, initialize from `VITE_LANGUAGE_CODE`. Switch via `setLocale("vi")` (see `App.vue` nav button). Bundled locales: `en`, `vi`.

## Forms

`vee-validate` + `zod` via `@vee-validate/zod`. See `views/form-view.vue` for the canonical pattern (`useForm`, `defineField`, `toTypedSchema`).

## UI components

Pre-built and auto-registered globally via `unplugin-vue-components` — drop into any template without import:

| Component  | Notes                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`   | variants × shapes × sizes, loading spinner, ripple effect, `unstyled` escape hatch                                                                                                           |
| `Input`    | floating label, type-aware (`text`, `password`, `email`, `number`, `tel`, `search`, `url`), password toggle, search icon, clear button, mask helper, error message, `prepend`/`append` slots |
| `VeeInput` | thin wrapper over `Input` that auto-wires `useField` from vee-validate — pass `name="..."` and the schema does the rest                                                                      |
| `Card`     | rounded container with shadow                                                                                                                                                                |
| `Badge`    | status pill with CVA variants                                                                                                                                                                |

Want more? Run `npx shadcn-vue@latest add <component>` — `components.json` is pre-configured.

## Routes

- `/` — Reka UI dialog demo
- `/counter` — Pinia store demo (`useCounterStore` auto-imported)
- `/users` — TanStack Query demo via `usersService.list()` + `Badge`
- `/form` — vee-validate + zod demo with the `Button` + `Input` + `Card` + `Badge` components

## Environment

```
VITE_APP_ENDPOINT=http://localhost:3000
VITE_API_PREFIX=/api/v1
VITE_LANGUAGE_CODE=en
# Optional — only used when your backend requires HMAC-signed requests
# VITE_HMAC_SECRET=
# VITE_BUILD_VERSION=1.0.0
```

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and design guidelines.
