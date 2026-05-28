# Nuxt starter

Opinionated Nuxt 4 starter mirroring the production patterns from the sibling Vue template. Canonical `app/` directory layout per the Nuxt 4 docs, with SSR-aware services and Japanese-ready i18n.

## Stack

| Concern | Choice |
|---|---|
| Framework | Nuxt 4 (Nitro server + Vue 3 + `<script setup>` + TypeScript) |
| UI | Nuxt UI 4 (`<U*>` prefix; Tailwind v4 bundled) |
| Project UI components | `app/components/ui/` (Button, Card, Input, VeeInput, Badge) — globally auto-registered, no prefix |
| Client state | Pinia (explicit imports — auto-import disabled) |
| Server state | TanStack Vue Query + `defineQuery` / `defineMutation` helpers |
| HTTP | Axios + class-based `Api` + interceptors (optional HMAC signing) |
| Forms | vee-validate + zod via `@vee-validate/zod` |
| i18n | `@nuxtjs/i18n` (en + ja JSON locales bundled, lazy-loaded) |
| Icons | lucide-vue-next |
| Dates | dayjs |
| Lint / format | `@nuxt/eslint` (flat config, TS via jiti) + Prettier (TS) |

## Setup

```sh
pnpm install
pnpm dev
```

`pnpm install` runs `nuxt prepare` postinstall to generate `.nuxt/`. Then `pnpm dev` boots the dev server at `http://localhost:3000`.

## Scripts

- `dev` — Nuxt dev server
- `build` — `nuxt build` (Nitro bundle in `.output/`)
- `preview` — `nuxt preview` the built bundle
- `generate` — full SSG build
- `typecheck` — `nuxt typecheck` (uses `vue-tsc`)
- `lint` — ESLint
- `format` — Prettier write

## Project layout (Nuxt 4 canonical)

```
templates/nuxtjs/
├── nuxt.config.ts                  # modules, components scope, pinia override, i18n, runtimeConfig
├── app.config.ts                   # Nuxt UI theme tokens
├── tsconfig.json                   # extends ./.nuxt/tsconfig.json
├── eslint.config.ts                # uses @nuxt/eslint (TS via jiti)
├── prettier.config.ts
├── pnpm-workspace.yaml             # strictDepBuilds:false, minimumReleaseAge:0
├── app/
│   ├── app.vue                     # <UApp><NuxtLayout><NuxtPage /></NuxtLayout></UApp>
│   ├── css/
│   │   ├── main.css                # @import "tailwindcss"; @import "@nuxt/ui"; @theme tokens
│   │   └── main.scss               # SCSS extras (safe-area, mixins)
│   ├── components/
│   │   └── ui/                     # auto-registered globally (Button, Card, Input, VeeInput, Badge)
│   ├── composables/                # auto-imported by Nuxt (camelCase `useFoo.ts`)
│   ├── enums/                      # STORAGE_KEYS (runtimeConfig-prefixed)
│   ├── layouts/default.vue         # nav + locale toggle
│   ├── pages/
│   │   ├── index.vue               # Nuxt UI landing
│   │   ├── counter.vue             # Pinia (explicit import)
│   │   ├── users.vue               # TanStack Query demo
│   │   └── form.vue                # vee-validate + zod + VeeInput
│   ├── plugins/
│   │   ├── 01.init-services.ts     # Api.setBaseURL + interceptors (universal)
│   │   ├── 02.vue-query.ts         # QueryClient registration
│   │   ├── 03.directives.ts        # v-track demo
│   │   └── 04.vee-validate.ts      # global VeeForm/VeeField/VeeError
│   ├── services/
│   │   ├── core/                   # api, model, interceptors, tanstack, hmac, headers, types
│   │   └── users/                  # domain folder with types/ subfolder
│   ├── stores/counter.ts           # Pinia (explicit imports — never auto)
│   └── utils/                      # cn (cva merge), format (dayjs) — auto-imported by Nuxt
├── i18n/locales/                   # en.json, ja.json (lazy-loaded)
├── server/                         # Nitro routes (empty placeholder)
└── public/                         # favicon, robots.txt
```

## Key conventions (mirror the Vue template)

- **Pinia stores stay explicit.** `import { useCounterStore } from "~/stores/counter"`. `pinia.storesDirs: []` in `nuxt.config.ts` disables auto-import.
- **UI auto-registration scoped to `~/components/ui` only.** Other components stay explicit imports. See `components: [{ path: "~/components/ui", global: true }]`.
- **Composable filenames in camelCase** (`useFoo.ts`) — exception to project-wide kebab-case.
- **Every SFC: named `interface Props` / `interface Emits` extracted above macros.** Never inline.
- **`<script setup>` strict section order:** imports → types → defineProps/Emits → composables → const → destructuring → let → ref → computed → functions → lifecycle.
- **No `any` types anywhere.**

## SSR safeguards

- `app/services/core/auth-token-storage.ts` guards every `localStorage` access behind `typeof window !== "undefined"`. Reads return `null` on the server; writes are no-ops.
- `STORAGE_KEYS` resolves prefix from `useRuntimeConfig().public.appName` so server + client see identical key names.
- `HMACSignatureGenerator` reads the secret from `runtimeConfig` (server-only by default); demo only — production HMAC belongs in a Nitro route.
- TanStack Vue Query plugin runs on both server and client; hydration handled internally.

## Services layer (mirrors Vue template)

`app/services/core/` holds the shared HTTP infra. Domain models live under `app/services/<domain>/` with a `types/` subfolder. Example:

```ts
// app/services/users/users.ts
export class UsersModel extends Model {
  static {
    Model.setup.call(this, { path: "/users", service: "MAIN" });
  }
  static list() { return this.api.get<User[]>(); }
}

export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: async () => (await UsersModel.list()).data,
});
```

## i18n

`@nuxtjs/i18n` 10.x with `strategy: "no_prefix"` (no URL prefix). Bundled locales in `i18n/locales/{en,ja}.json` are lazy-loaded. Toggle via the layout's locale button — persists via cookie.

## Forms

vee-validate + zod via `@vee-validate/zod`. See `app/pages/form.vue` for the canonical pattern (`useForm` with `initialValues` to dodge "expected string, received undefined" on first paint).

## UI components

Auto-registered globally via Nuxt's `components: [{ path: "~/components/ui", global: true }]`:

| Component | Notes |
|---|---|
| `<Button>` | variant × shape × size, loading spinner, ripple, block, `unstyled` escape hatch |
| `<Input>` | floating label, type-aware (password/email/number/tel/search), mask helper, slots |
| `<VeeInput>` | wraps `<Input>` via `useField`; pass `name="..."` |
| `<Card>` | rounded container |
| `<Badge>` | CVA variant pill |

Nuxt UI components keep the `<U*>` prefix (`<UButton>`, `<UCard>`, ...). They live alongside the project UI components — pick whichever fits the use case.

## Routes

- `/` — Nuxt UI showcase (`<UButton>` + `<UCard>`) alongside project `<Button>`
- `/counter` — Pinia store demo (`useCounterStore` explicit import)
- `/users` — TanStack Query demo via `usersService.list()` → axios
- `/form` — vee-validate + zod with `<VeeInput>` + `<Button>` + `<Card>` + `<Badge>`

## Environment

```
NUXT_PUBLIC_APP_NAME=PRISM_APP
NUXT_PUBLIC_API_BASE_URL=https://jsonplaceholder.typicode.com
NUXT_PUBLIC_LANGUAGE_CODE=en
```

For private (server-only) secrets like HMAC signing, add unprefixed keys (`NUXT_HMAC_SECRET=...`) and access via `useRuntimeConfig().hmacSecret`.

## Verified

- `pnpm install` → green (workspace yaml ships with `strictDepBuilds: false`, `minimumReleaseAge: 0`)
- `pnpm build` → 7.19 MB / 1.72 MB gzipped
- `pnpm typecheck` → clean (`vue-tsc` 3.x)
