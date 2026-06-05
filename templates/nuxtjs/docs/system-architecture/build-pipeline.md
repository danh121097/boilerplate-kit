# Build Pipeline

How the project compiles, type-checks, and bundles. Driven by **Nuxt 4** (Vite
under the hood, Nitro server engine), configured in `nuxt.config.ts`, with the
scripts in `package.json`. Package manager: **pnpm**.

## Nuxt Config (`nuxt.config.ts`)

```ts
export default defineNuxtConfig({
  compatibilityDate: "2026-05-21",
  devtools: { enabled: true },
  devServer: { port: 4321 },                 // avoids the crowded port 3000

  modules: ["@nuxt/eslint", "@pinia/nuxt", "@nuxtjs/i18n", "@vueuse/nuxt"],
  css: ["@/css/main.css", "@/css/main.scss"],
  vite: { plugins: [tailwindcss()] },        // Tailwind v4 native Vite plugin

  pinia: { storesDirs: [] },                  // disable store auto-import (explicit only)
  i18n: { defaultLocale: "en", strategy: "no_prefix", lazy: true, locales: [...] },
  runtimeConfig: { public: { /* see SSR doc */ } },
  typescript: { strict: true, typeCheck: false },
});
```

### Modules

| Module | Purpose |
| --- | --- |
| `@nuxt/eslint` | Flat-config ESLint integration (`eslint.config.ts`). |
| `@pinia/nuxt` | Pinia state — `storesDirs: []` disables store auto-import. |
| `@nuxtjs/i18n` | i18n; `no_prefix` strategy, lazy `en`/`ja` locales from `i18n/locales/`. |
| `@vueuse/nuxt` | Auto-imports VueUse composables (`useThrottleFn`, etc.). |

`@tailwindcss/vite` is registered via `vite.plugins` (Tailwind v4 — no PostCSS
config). Styles load from `app/css/main.css` + `app/css/main.scss`.

## Auto-Imports

Nuxt auto-imports without explicit `import` statements:

- **Vue / Nuxt APIs:** `ref`, `computed`, `onMounted`, `defineStore`,
  `useRuntimeConfig`, `defineNuxtPlugin`, `useI18n`, etc.
- **VueUse:** via `@vueuse/nuxt` (e.g. `useThrottleFn`, `storeToRefs`).
- **Components:** every file under `app/components/**` is auto-imported with a
  path-derived prefix — `app/components/ui/Button.vue` → `<UiButton>`. No
  explicit `components:` config is needed.
- **Composables:** `app/composables/**` are auto-imported (`useSocketIO`).

Stores are the deliberate exception — `storesDirs: []` keeps them explicit
(`import { useXStore } from "@/stores/x"`).

### `@/` alias

`@` maps to the `app/` srcDir (Nuxt 4 default). Import via `@/...` (e.g.
`@/services/core`, `@/stores/socket-io`, `@/enums`) rather than relative paths.

## Type Checking

`typescript.strict: true` enables strict mode; `typeCheck: false` keeps type
errors out of the dev/build hot path for speed. Run them explicitly:

```
pnpm typecheck   # nuxt typecheck (vue-tsc under the hood)
```

## Build Targets

| Command | Output |
| --- | --- |
| `nuxt build` | SSR server bundle + client bundle (Nitro server, deploy to a Node host) |
| `nuxt generate` | Pre-rendered static site (SSG) — for static hosting |
| `nuxt preview` | Serve the production build locally |

`postinstall` runs `nuxt prepare` to generate `.nuxt/` types after install.

## Environment Variables

Configuration is **runtime**, not build-time: `NUXT_PUBLIC_*` env vars override
`runtimeConfig.public` keys at boot — no rebuild to retarget environments. Full
table in [SSR & Runtime Config](./ssr-and-runtime-config.md).

## Scripts (`package.json`)

```bash
pnpm dev          # nuxt dev — dev server with HMR (port 4321)
pnpm build        # nuxt build — SSR build
pnpm generate     # nuxt generate — static site
pnpm preview      # nuxt preview — serve the production build
pnpm typecheck    # nuxt typecheck — types only
pnpm test         # vitest run
pnpm test:watch   # vitest — watch mode
pnpm lint         # eslint .
pnpm format       # prettier --write .
```
