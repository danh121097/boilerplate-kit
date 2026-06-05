# Project Overview

A Nuxt 4 + TypeScript **SSR** starter, wired for a real backend out of the box:
an SSR-guarded axios service layer with JWT bearer auth, httpOnly refresh-token
rotation, optional HMAC request signing, TanStack Vue Query for server state,
Pinia for client state, Socket.IO, and `@nuxtjs/i18n`. The intent is a thin but
complete foundation — copy it, point the `NUXT_PUBLIC_*` env vars at your API,
and start building features.

The app source lives under **`app/`** (Nuxt 4 `srcDir`). The root entry is
`app/app.vue` (`<NuxtLayout><NuxtPage /></NuxtLayout>`); bootstrap happens in
ordered `app/plugins/*` that run on **both server and client**.

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Nuxt 4 (`nuxt@4.4.6`, `app/` srcDir, SSR) |
| View layer | Vue 3.5 (`vue@^3.5.34`, `<script setup>`) |
| Language | TypeScript 6, `strict: true` (typeCheck off in dev; `pnpm typecheck`) |
| Routing | File-based pages (`app/pages/`) via `vue-router@^5` |
| Client state | Pinia 3 (`@pinia/nuxt`, `app/stores/`) |
| Server state | TanStack Vue Query 5 (`app/services/core/tanstack.ts`) |
| HTTP | axios 1 service layer, SSR-guarded (`app/services/`) |
| Auth | JWT bearer + httpOnly refresh-cookie rotation + optional HMAC |
| Realtime | Socket.IO client 4 (`app/composables/useSocketIO.ts`) |
| UI primitives | Reka UI 2 + `lucide-vue-next` icons |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + SCSS (`sass-embedded`) |
| Forms | vee-validate 4 + `@vee-validate/zod` + zod 4 |
| i18n | `@nuxtjs/i18n` 10 (`en`, `ja`; `no_prefix`, lazy) |
| Dates | dayjs (`app/utils/date-format.ts`) |
| Utilities | `@vueuse/nuxt`, `clsx`, `tailwind-merge`, `class-variance-authority` |

Package manager: **pnpm**.

## Scripts

From `package.json`:

```bash
pnpm dev          # nuxt dev (port 4321 — see nuxt.config.ts devServer)
pnpm build        # nuxt build
pnpm preview      # nuxt preview
pnpm generate     # nuxt generate (static)
pnpm postinstall  # nuxt prepare (runs automatically)
pnpm typecheck    # nuxt typecheck
pnpm test         # vitest run
pnpm test:watch   # vitest (watch mode)
pnpm lint         # eslint .
pnpm format       # prettier --write .
```

## Environment Variables

Bound to `runtimeConfig.public` in `nuxt.config.ts` (read via
`useRuntimeConfig()`, **never** `import.meta.env`):

| Env var | runtimeConfig key | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_APP_NAME` | `appName` | localStorage key prefix |
| `NUXT_PUBLIC_API_BASE_URL` | `apiBaseUrl` | MAIN backend base URL |
| `NUXT_PUBLIC_APP_ENDPOINT` | `appEndpoint` | Socket.IO endpoint |
| `NUXT_PUBLIC_LANGUAGE_CODE` | `languageCode` | default locale code |
| `NUXT_PUBLIC_HMAC_SECRET` | `hmacSecret` | HMAC request signing secret |
| `NUXT_PUBLIC_BUILD_VERSION` | `buildVersion` | sent as `x-version` header |

`apiBaseUrl` falls back to `https://jsonplaceholder.typicode.com` so the starter
runs unconfigured (see `app/plugins/01.init-services.ts`). See `.env.example`.

## Key Constraints

- **SSR-safe** — all `window`/`localStorage` access is client-guarded
  (`isClient()` in `app/services/core/auth-token-storage.ts`); secrets are read
  via `useRuntimeConfig()` inside a request scope, not at module top-level.
- **Component auto-import is scoped** — Nuxt auto-imports `app/components/**`
  with a path-derived prefix (`app/components/ui/Button.vue` → `<UiButton>`).
- **Stores are explicit** — `pinia.storesDirs: []` disables store auto-import;
  always `import { useXStore } from "@/stores/x"`.
- **HMAC is a PUBLIC runtime config** — exposed to every browser client. For
  production, sign in a Nitro server route / BFF and keep the secret private
  (`runtimeConfig.hmacSecret`); the in-browser signer is a convenience (see
  notes in `app/services/core/hmac-signature.ts` and `useSocketIO.ts`).
- **Refresh token is server-owned** — it lives in an httpOnly cookie; only the
  short-lived access token is held client-side (in `localStorage`).
- **File size** — aim for ≤ ~200 LOC per file; split early.

## Intentionally NOT Included

- No `server/` (Nitro) routes — the directory is empty; this is a frontend that
  talks to an external backend (e.g. the Express template).
- No global auth middleware / protected routes (`app/middleware/` is absent).
- No state-persistence plugin for Pinia.
- No component library beyond a small `app/components/ui/` set (Button, Input,
  VeeInput, Badge, Card).
- No CI workflow or deployment config in this template layer.

## Related Documentation

- [codebase-summary.md](./codebase-summary.md) — where things live
- [code-standards.md](./code-standards.md) — how to write code here
- [system-architecture.md](./system-architecture.md) — bootstrap, data flow, auth
- [README.md](./README.md) — full documentation map
