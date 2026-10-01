# Project Overview

A Nuxt 4 + TypeScript **SSR** starter, wired for a real backend out of the box:
an SSR-guarded axios service layer with httpOnly-cookie JWT Auth, refresh-token
rotation, HMAC request signing, TanStack Vue Query for server state,
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
| Auth | httpOnly access + refresh cookies (rotation) + session hint cookie + HMAC request signing |
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
pnpm lint         # eslint . && prettier --check . (read-only)
pnpm lint:fix     # eslint . --fix && prettier --write .
pnpm format       # prettier --write .
```

## Environment Variables

Bound to `runtimeConfig.public` in `nuxt.config.ts` (read via
`useRuntimeConfig()`, **never** `import.meta.env`):

| Env var | runtimeConfig key | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_APP_NAME` | `appName` | prefix for storage, cookie and lock keys |
| `NUXT_PUBLIC_APP_ENDPOINT` | `appEndpoint` | Backend origin; `getApiBaseUrl()` appends `/api/v1` (Socket.IO uses it bare) |
| `NUXT_PUBLIC_API_PREFIX` | `apiPrefix` | REST version prefix (default `/api/v1`) |
| `NUXT_PUBLIC_LANGUAGE_CODE` | `languageCode` | default locale (`en` / `ja`) when there is no saved cookie or matching browser language; read when `nuxt.config.ts` loads |
| `NUXT_PUBLIC_HMAC_SECRET` | `hmacSecret` | HMAC signing secret; required by the bundled backends and must equal the backend `HMAC_SECRET` (an empty one logs a dev warning and every request 401s) |
| `NUXT_PUBLIC_BUILD_VERSION` | `buildVersion` | sent as `x-version` header |
| `NUXT_PUBLIC_AUTH_MOCK` | `authMock` | dev only: `true`/`1` answers `/auth/*` and `/users` in the browser; ignored in production builds |
| `NUXT_PUBLIC_AUTH_MOCK_EMAIL` / `NUXT_PUBLIC_AUTH_MOCK_PASSWORD` | `authMockEmail` / `authMockPassword` | mock login credentials (default `demo@example.com` / `password`) |

`appEndpoint` falls back to `http://localhost:3000` so the starter
runs unconfigured (see `app/plugins/01.init-services.ts`); the REST base is `appEndpoint + /api/v1`. See `.env.example`.

## Key Constraints

- **SSR-safe** — browser-only access (`document`, `localStorage`) is guarded
  (`typeof document === "undefined"`, as in `app/services/core/session.ts`) or kept
  in `onMounted`; secrets are read via `useRuntimeConfig()` inside a request scope, not at module top-level.
- **Component auto-import is scoped** — Nuxt auto-imports `app/components/**`
  with a path-derived prefix (`app/components/ui/Button.vue` → `<UiButton>`).
- **Stores are explicit** — `pinia.storesDirs: []` disables store auto-import;
  always `import { useXStore } from "@/stores/x"`.
- **HMAC is a PUBLIC runtime config** — exposed to every browser client, so it
  is an anti-abuse / light integrity layer only, not authentication or a
  security boundary. It must stay `public`: the
  browser signs its own requests, and a private-only secret would break them.
  For an unforgeable signature, proxy browser traffic through a server route
  that signs (see `app/services/core/hmac-signature.ts`).
- **Tokens are server-owned** — both the access and refresh tokens live in
  httpOnly cookies; JS holds only the readable session hint cookie.
- **File size** — aim for ≤ ~200 LOC per file; split early.

## Intentionally NOT Included

- No `server/` (Nitro) routes — there is no such directory; this is a frontend that
  talks to an external backend (e.g. the Express template).
- No global auth middleware — protected routes use the named `auth` / `guest` route middleware in `app/middleware/`.
- No state-persistence plugin for Pinia.
- No component library beyond a small `app/components/ui/` set (Button, Input,
  VeeInput, Badge, Card).
- No CI workflow or deployment config in this template layer.

## Related Documentation

- [codebase-summary.md](./codebase-summary.md) — where things live
- [code-standards.md](./code-standards.md) — how to write code here
- [system-architecture.md](./system-architecture.md) — bootstrap, data flow, auth
- [README.md](./README.md) — full documentation map
