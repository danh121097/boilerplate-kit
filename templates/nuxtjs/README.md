# Nuxt starter

Opinionated Nuxt 4 starter mirroring the production patterns from the sibling Vue template. Canonical `app/` directory layout per the Nuxt 4 docs, with SSR-aware services and Japanese-ready i18n.

## Stack

| Concern | Choice |
|---|---|
| Framework | Nuxt 4 (Nitro server + Vue 3 + `<script setup>` + TypeScript) |
| UI primitives | Reka UI (headless, project drives styling) |
| Project UI components | `app/components/ui/` (Button, Card, Input, VeeInput, Badge) with cva variants + shadcn-vue HSL tokens — auto-registered as `<Ui*>` |
| Styling | Tailwind v4 (`@tailwindcss/vite` plugin) + `tailwindcss-animate` |
| Client state | Pinia (explicit imports — auto-import disabled) |
| Server state | TanStack Vue Query + `defineQuery` / `defineMutation` helpers |
| HTTP | Axios + class-based `Api` + interceptors (optional HMAC signing) |
| Forms | vee-validate + zod via `@vee-validate/zod` |
| i18n | `@nuxtjs/i18n` (en + ja TS locales, lazy-loaded; vue-i18n message types augmented) |
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
├── tsconfig.json                   # extends ./.nuxt/tsconfig.json
├── eslint.config.ts                # uses @nuxt/eslint (TS via jiti)
├── prettier.config.ts
├── pnpm-workspace.yaml             # strictDepBuilds:false, minimumReleaseAge:0
├── app/
│   ├── app.vue                     # <NuxtLayout><NuxtPage /></NuxtLayout>
│   ├── css/
│   │   ├── main.css                # @import "tailwindcss"; @theme HSL tokens + @utility helpers
│   │   └── main.scss               # SCSS extras (safe-area, mixins)
│   ├── components/
│   │   └── ui/                     # auto-registered globally (Button, Card, Input, VeeInput, Badge)
│   ├── composables/                # auto-imported by Nuxt (camelCase `useFoo.ts`)
│   ├── enums/                      # STORAGE_KEYS (runtimeConfig-prefixed)
│   ├── layouts/default.vue         # nav + locale toggle
│   ├── pages/
│   │   ├── index.vue               # Reka UI Dialog showcase + project component grid
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

- **Pinia stores stay explicit.** `import { useCounterStore } from "@/stores/counter"`. `pinia.storesDirs: []` in `nuxt.config.ts` disables auto-import.
- **UI components live under `@/components/ui/` and auto-import with the `<Ui*>` prefix** (Nuxt's default path-derived naming): `<UiButton>`, `<UiCard>`, `<UiInput>`, `<UiVeeInput>`, `<UiBadge>`. No explicit `components:` config needed — Nuxt's default scan handles it. Headless primitives come from Reka UI (imported directly).
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

`@nuxtjs/i18n` 10.x with `strategy: "no_prefix"` (no URL prefix). Bundled locales in `i18n/locales/{en,ja}.ts` are lazy-loaded. `types/i18n.d.ts` augments `vue-i18n`'s `DefineLocaleMessage` so `t("nav.home")` autocompletes and typos fail at compile time. Toggle via the layout's locale button — persists via cookie.

## Forms

vee-validate + zod via `@vee-validate/zod`. See `app/pages/form.vue` for the canonical pattern (`useForm` with `initialValues` to dodge "expected string, received undefined" on first paint).

## UI components

Project owns the entire UI surface — Reka UI provides headless primitives (Dialog, Popover, Combobox, …) and the project layers styled wrappers on top.

| Component | Source | Notes |
|---|---|---|
| `<UiButton>` | `components/ui/Button.vue` | variant × shape × size, loading spinner, ripple, block, `unstyled` escape hatch |
| `<UiInput>` | `components/ui/Input.vue` | floating label, type-aware (password/email/number/tel/search), mask helper, slots |
| `<UiVeeInput>` | `components/ui/VeeInput.vue` | wraps `<UiInput>` via `useField`; pass `name="..."` |
| `<UiCard>` | `components/ui/Card.vue` | rounded container with shadow |
| `<UiBadge>` | `components/ui/Badge.vue` | CVA variant pill |

For complex interactive primitives (dialog, popover, dropdown, accordion, combobox, …) import directly from `reka-ui` — see `pages/index.vue` for a `DialogRoot` showcase.

## Routes

- `/` — Reka UI dialog showcase + project `<UiButton>` variants in a `<UiCard>` grid
- `/counter` — Pinia store demo (`useCounterStore` explicit import)
- `/users` — TanStack Query demo via `usersService.list()` → axios
- `/form` — vee-validate + zod with `<VeeInput>` + `<Button>` + `<Card>` + `<Badge>`

## Environment

```
NUXT_PUBLIC_APP_NAME=PRISM_APP
NUXT_PUBLIC_APP_ENDPOINT=http://localhost:3000
NUXT_PUBLIC_API_PREFIX=/api/v1
NUXT_PUBLIC_LANGUAGE_CODE=en
```

For private (server-only) secrets like HMAC signing, add unprefixed keys (`NUXT_HMAC_SECRET=...`) and access via `useRuntimeConfig().hmacSecret`.

## Verified

- `pnpm install` → green (workspace yaml ships with `strictDepBuilds: false`, `minimumReleaseAge: 0`)
- `pnpm build` → 7.19 MB / 1.72 MB gzipped
- `pnpm typecheck` → clean (`vue-tsc` 3.x)

## Documentation

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, design guidelines.
