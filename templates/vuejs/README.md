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

## Quick start

```sh
pnpm install
pnpm dev
```

The first `pnpm dev` regenerates `auto-imports.d.ts` and `components.d.ts` — both are gitignored.

## Scripts

| Script           | What it does                                        |
| ---------------- | --------------------------------------------------- |
| `pnpm dev`       | Vite dev server                                     |
| `pnpm build`     | `vue-tsc --noEmit` + production Vite build          |
| `pnpm preview`   | Preview the production build                        |
| `pnpm typecheck` | `vue-tsc --noEmit`                                  |
| `pnpm test`      | Vitest (`vitest run`)                               |
| `pnpm test:watch`| Vitest in watch mode                                |
| `pnpm lint`      | Read-only: `eslint .` + `prettier --check .`        |
| `pnpm lint:fix`  | `eslint . --fix` + `prettier --write .`             |
| `pnpm format`    | `prettier --write .`                                |

## Env

| Variable                  | Default                 | Notes                                                                                    |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| `VITE_APP_ENDPOINT`       | `http://localhost:3000` | Backend origin                                                                           |
| `VITE_API_PREFIX`         | `/api/v1`               | API path prefix                                                                          |
| `VITE_LANGUAGE_CODE`      | `en`                    | Fallback locale when nothing is saved in `localStorage`                                  |
| `VITE_HMAC_SECRET`        | unset                   | Optional. Enables HMAC-signed requests; the secret ships in the bundle                   |
| `VITE_BUILD_VERSION`      | `1.0.0`                 | Optional. Sent as `x-version` when signing                                               |
| `VITE_AUTH_MOCK`          | unset                   | Optional, dev only. `true` answers `/auth/*` and `/users` in the browser                 |
| `VITE_AUTH_MOCK_EMAIL`    | `demo@example.com`      | Optional, dev only. Demo account email                                                   |
| `VITE_AUTH_MOCK_PASSWORD` | `password`              | Optional, dev only. Demo account password                                                |

## Structure

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
│   ├── users/                    # UsersModel (paginated list) + `useUsersListQuery`
│   └── …
├── stores/                       # Pinia — explicit imports (`import { useXStore } from "@/stores/x"`)
├── utils/                        # cn (cva merge), format (dayjs helpers) — auto-imported
└── views/                        # page-level components (incl. not-found-view.vue)
```

## Auto-imports

- `vue` (`ref`, `computed`, …), `vue-router` (`useRouter`, `useRoute`), `@vueuse/core` (`useStorage`, …) auto-imported in every `<script setup>` and `.ts` file.
- Files under `src/composables/**` and `src/utils/**` auto-imported by named export. Stores stay explicit (`import { useCounterStore } from "@/stores/counter"`).
- Only `src/components/ui/**` is auto-registered as global components. Other folders under `src/components/**` (feature components, layouts, etc.) stay explicit imports so the global registry doesn't grow unbounded.
- Components in `src/components/**` auto-registered globally — drop `<Button>`, `<Card>` into any template, no import line.

## Services layer

`src/services/core/` mirrors a production setup:

- `Api` — class-based axios client with multi-service support (`MAIN` / `AUX`), lazy interceptor registration, in-flight request counter, and `get` / `paginate` / `cursorPaginate` / `post` / `put` / `patch` / `delete` helpers.
- `ApiInterceptors` — request interceptor injects auth + optional HMAC headers; response interceptor unwraps `{ success, data, ... }` envelopes and, on 401, refreshes once (single-flight, cross-tab locked) and replays; login/register/logout 401s are never refreshed, and a refused refresh routes to `/login` instead of reloading.
- `HMACSignatureGenerator` — produces `sig` / `ctime` / `x-version` headers on HTTP requests, and `sig` / `ctime` on the socket handshake, only when `VITE_HMAC_SECRET` is set. The secret ships in the bundle, so this is anti-casual-abuse only, not authentication. Safe to delete if your backend doesn't sign.
- `Model` — base class for domain models; subclass and call `Model.setup({ path, service })`.
- `defineQuery` / `defineMutation` — typed wrappers around TanStack Vue Query with consistent error type.

Example domain service in `src/services/users/users.ts`. `list` returns the backend's paginated envelope (`PaginatedResponse<User>`: `{ success, data, meta }`); `get` / `update` return the unwrapped `User`:

```ts
export class UsersModel extends Model {
  static list(params?: PaginationParams): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ url: usersContract.paths.list, params });
  }
}
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => UsersModel.list(),
});
```

Pages read `data.data` and render `users.empty` when the list is empty.

Session restore: if reading the profile at boot fails for a reason other than a 401 (offline, timeout, 5xx), the session is kept, `useAuthStore().hydrateError` is set, and `App.vue` shows a `role="alert"` banner (`session.unavailable`) with a `session.retry` button that calls `retryHydrate()`. A 401 is the normal logged-out flow and shows no banner.

## i18n

Locale stored in `localStorage.language` (access is wrapped in try/catch), falling back to `VITE_LANGUAGE_CODE`, then `en`. Switch via `setLocale("ja")` (see `App.vue` nav button). Bundled locales: `en`, `ja`. Validation messages, the not-found page and the password-toggle label all come from the locale files.

## Forms

`vee-validate` + `zod` via `@vee-validate/zod`. See `views/login-view.vue` and `views/form-view.vue` for the canonical pattern (`useForm`, `defineField`, `toTypedSchema`). The shared schema in `services/auth/schema/login.ts` carries i18n keys as messages; `VeeInput` translates them when rendering, so errors follow a locale switch.

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
- `/users` — protected; TanStack Query demo via `UsersModel.list()` + `Badge`, with an empty state
- `/form` — vee-validate + zod demo with the `Button` + `Input` + `Card` + `Badge` components
- `/login` — guests only; vee-validate + zod, server error shown in a `role="alert"` element
- `/:pathMatch(.*)*` — `not-found-view.vue` for any unknown URL

## Mock auth

Set `VITE_AUTH_MOCK=true` (dev only) to answer `/auth/*` and `/users` in the browser before the backend exists; the flag is ignored in production builds. See [Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration).

## Docs

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and design guidelines.
