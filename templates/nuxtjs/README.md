# Nuxt starter

Opinionated Nuxt 4 SSR starter mirroring the production patterns from the sibling Vue template. Canonical `app/` directory layout per the Nuxt 4 docs, with SSR-aware services, httpOnly-cookie auth and Japanese-ready i18n.

## Stack

| Concern | Choice |
|---|---|
| Framework | Nuxt 4 (Nitro server + Vue 3 + `<script setup>` + TypeScript) |
| UI primitives | Reka UI (headless, project drives styling) |
| UI components | `app/components/ui/` (Button, Card, Input, VeeInput, Badge) with cva variants + shadcn-vue HSL tokens — auto-registered as `<Ui*>` |
| Styling | Tailwind v4 (`@tailwindcss/vite` plugin) + `tailwindcss-animate` |
| Client state | Pinia (explicit imports — auto-import disabled) |
| Server state | TanStack Vue Query + `defineQuery` / `defineMutation` helpers |
| HTTP | Axios + class-based `Api` + interceptors (HMAC signing, cookie refresh) |
| Forms | vee-validate + zod via `@vee-validate/zod` |
| i18n | `@nuxtjs/i18n` (en + ja TS locales, lazy-loaded; vue-i18n message types augmented) |
| Realtime | Socket.IO client |
| Icons | lucide-vue-next |
| Dates | dayjs |
| Lint / format | `@nuxt/eslint` (flat config, TS via jiti) + Prettier |

## Quick start

```sh
pnpm install
pnpm dev
```

`pnpm install` runs `nuxt prepare` (postinstall) to generate `.nuxt/`. `pnpm dev` boots the dev server at `http://localhost:4321`.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Nuxt dev server |
| `pnpm build` | `nuxt build` (Nitro bundle in `.output/`) |
| `pnpm preview` | Serve the production build |
| `pnpm generate` | Full static (SSG) build |
| `pnpm typecheck` | `nuxt typecheck` (`vue-tsc`) |
| `pnpm test` | Vitest (`vitest run`) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | Read-only: `eslint .` + `prettier --check .` |
| `pnpm lint:fix` | `eslint . --fix` + `prettier --write .` |
| `pnpm format` | `prettier --write .` |

## Env

Bound to `runtimeConfig.public` (read via `useRuntimeConfig()`); copy `.env.example` to `.env`.

| Variable | Default | Notes |
|---|---|---|
| `NUXT_PUBLIC_APP_NAME` | unset | Prefix for storage / cookie keys |
| `NUXT_PUBLIC_APP_ENDPOINT` | `http://localhost:3000` | Backend origin |
| `NUXT_PUBLIC_API_PREFIX` | `/api/v1` | API path prefix |
| `NUXT_PUBLIC_LANGUAGE_CODE` | `en` | Default locale (`en` / `ja`) when no cookie or browser language matches; read at build/start of `nuxt.config.ts` |
| `NUXT_PUBLIC_HMAC_SECRET` | unset | Required by the bundled backends; must equal the backend `HMAC_SECRET`. Visible to every client (anti-abuse, not authentication) |
| `NUXT_PUBLIC_BUILD_VERSION` | `1.0.0` | Optional. Sent as `x-version` when signing |
| `NUXT_PUBLIC_AUTH_MOCK` | unset | Optional, dev only. `true` answers `/auth/*` and `/users` in the browser |
| `NUXT_PUBLIC_AUTH_MOCK_EMAIL` | `demo@example.com` | Optional, dev only. Demo account email |
| `NUXT_PUBLIC_AUTH_MOCK_PASSWORD` | `password` | Optional, dev only. Demo account password |

For private (server-only) secrets, add unprefixed keys (e.g. `NUXT_MY_SECRET`, declared under `runtimeConfig`) and read them via `useRuntimeConfig().mySecret`. The HMAC secret is **not** one of them: the browser signs its own requests, so it stays `NUXT_PUBLIC_HMAC_SECRET`.

**Real backend checklist**: turn mock auth off (`NUXT_PUBLIC_AUTH_MOCK` unset), point `NUXT_PUBLIC_APP_ENDPOINT` / `NUXT_PUBLIC_API_PREFIX` at the backend, and set `NUXT_PUBLIC_HMAC_SECRET` to the backend's `HMAC_SECRET`. An empty secret makes every request 401 (dev builds log a warning).

## Structure

```
templates/nuxtjs/
├── nuxt.config.ts                  # modules, pinia override, i18n, runtimeConfig, tsconfig baseline
├── tsconfig.json                   # extends ./.nuxt/tsconfig.json
├── eslint.config.ts                # @nuxt/eslint (TS via jiti) + local/sort-setup-declarations
├── prettier.config.ts
├── pnpm-workspace.yaml
├── app/
│   ├── app.vue                     # <NuxtLayout><NuxtPage /></NuxtLayout>
│   ├── error.vue                   # 404 → not-found content, other errors → generic message
│   ├── css/                        # main.css (Tailwind @theme tokens), main.scss (extras)
│   ├── components/ui/              # Button, Card, Input, VeeInput, Badge (auto-registered as <Ui*>)
│   ├── composables/                # useSocketIO (auto-imported, camelCase filenames)
│   ├── enums/                      # useStorageKeys(), socket events
│   ├── layouts/default.vue         # nav, locale toggle, session-unavailable banner
│   ├── middleware/                 # auth + guest route middleware
│   ├── pages/                      # index, counter, users, form, login
│   ├── plugins/                    # init-services, vue-query, directives, session expiry/sync
│   ├── services/                   # core (api, model, interceptors, tanstack, hmac), auth, users
│   ├── stores/                     # counter, socket-io (Pinia, explicit imports)
│   ├── utils/                      # cn, date-format (auto-imported)
│   └── __tests__/                  # unit + integration (Vitest, node env)
├── i18n/locales/                   # en.ts, ja.ts (lazy-loaded)
├── eslint-rules/                   # local ESLint rule: sort-setup-declarations
└── types/i18n.d.ts                 # typed message keys
```

## How auth works

Cookie-first: the backend sets httpOnly access + refresh cookies, so no token touches JS. The layout resolves the session once during SSR (`useMeQuery` through `useServerRenderedQuery`), so the header renders signed in or out on the server and hydrates without a mismatch. A 401 renders signed-out and the browser resolves it after hydration (it can refresh the access cookie). Any other failure (offline, timeout, 5xx) keeps the session and shows a `role="alert"` banner with a Retry button. `/login` validates with vee-validate + zod (`validation.*` messages) and shows server errors in a `role="alert"` element. Details: [Security & Auth](./docs/system-architecture/security-auth.md).

## SSR safety

- Storage and `window` access are client-guarded; secrets come from `runtimeConfig`, never `import.meta.env`.
- `useStorageKeys()` resolves its prefix from `useRuntimeConfig().public.appName` so server and client agree.
- A page that renders query data resolves it during SSR with `useServerRenderedQuery(useXxxQuery)` so the server renders the data (or error) the client hydrates, not a loading state the client never shows.
- `HMACSignatureGenerator` reads the secret from `runtimeConfig`; the socket handshake reuses it.

See [SSR & Runtime Config](./docs/system-architecture/ssr-and-runtime-config.md).

## Auto-imports

Nuxt auto-imports Vue APIs, Nuxt composables, `app/composables/**`, `app/utils/**` and `app/components/**` (with a path-derived prefix: `components/ui/Button.vue` becomes `<UiButton>`). Pinia stores stay explicit (`pinia.storesDirs: []`). Composable filenames are camelCase (`useFoo.ts`).

## Users contract

`UsersModel.list(params?)` resolves the paginated envelope `{ data, meta }` (`PaginatedResponse<User>`); `get` resolves the unwrapped `User`. `/users` renders `data.data`, the error message, or `users.empty` when the list is empty.

## i18n

`@nuxtjs/i18n` with `strategy: "no_prefix"`. The language is the saved `<APP_NAME>_LANGUAGE` cookie, else the browser language, else `NUXT_PUBLIC_LANGUAGE_CODE`, else `en`. The layout's EN/JA button saves the choice. `types/i18n.d.ts` types `t("nav.home")` keys from `en.ts`.

## Forms

vee-validate + zod via `@vee-validate/zod`. See `app/pages/login.vue` and `app/pages/form.vue` for the pattern: `useForm` with `initialValues` (avoids "expected string, received undefined" on first paint) and `UiVeeInput` fields whose labels are tied to their inputs.

## UI components

| Component | Source | Notes |
|---|---|---|
| `<UiButton>` | `components/ui/Button.vue` | variant × shape × size, loading spinner, ripple, block, `unstyled` escape hatch |
| `<UiInput>` | `components/ui/Input.vue` | floating label linked with `for`/`id`, `autocomplete`, type-aware (password/email/number/tel/search), mask helper, slots |
| `<UiVeeInput>` | `components/ui/VeeInput.vue` | wraps `<UiInput>` via `useField`; pass `name="..."` |
| `<UiCard>` | `components/ui/Card.vue` | rounded container with shadow |
| `<UiBadge>` | `components/ui/Badge.vue` | CVA variant pill |

Complex primitives (dialog, popover, …) come straight from `reka-ui` — see `pages/index.vue` for the dialog demo. Layouts and pages use theme tokens (`bg-background`, `text-foreground`, `text-primary`, …); the active nav link takes `text-primary`. No dark-mode toggle is provided.

## Routes

- `/` — Reka UI dialog demo
- `/counter` — Pinia store demo
- `/users` — TanStack Query demo (admin only; paginated list)
- `/form` — vee-validate + zod demo
- `/login` — sign in
- any other path — `app/error.vue` not-found page

## Mock auth (before backend integration)

`NUXT_PUBLIC_AUTH_MOCK=true` answers auth and users in the browser and during SSR, so pages can be built before the backend exists. The flag is ignored in production builds. See [Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration).

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, design guidelines.
