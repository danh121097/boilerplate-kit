# Project Overview

A Vue 3 + TypeScript single-page-app starter, wired for a real backend out of
the box: an axios service layer with JWT bearer auth, httpOnly refresh-token
rotation, optional HMAC request signing, TanStack Vue Query for server state,
Pinia for client state, Socket.IO, and vue-i18n. The intent is a thin but
complete foundation — copy it, point the env vars at your API, and start
building features.

## Tech Stack

| Concern | Choice |
| --- | --- |
| Framework | Vue 3.5 (`vue@^3.5.34`, `<script setup>`) |
| Build tool | Vite 8 (`vite@^8.0.13`) + `@vitejs/plugin-vue` |
| Language | TypeScript 6, `strict` + `noUncheckedIndexedAccess` |
| Routing | `vue-router@^5` (lazy routes, `src/router/index.ts`) |
| Client state | Pinia 3 (`src/stores/`) |
| Server state | TanStack Vue Query 5 (`src/services/core/tanstack.ts`) |
| HTTP | axios 1 service layer (`src/services/`) |
| Auth | JWT bearer + httpOnly refresh-cookie rotation + optional HMAC |
| Realtime | Socket.IO client 4 (`src/composables/useSocketIO.ts`) |
| UI primitives | Reka UI 2 + `lucide-vue-next` icons |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + SCSS (`sass-embedded`) |
| Forms | vee-validate 4 + `@vee-validate/zod` + zod 4 |
| i18n | vue-i18n 11 (`en`, `ja`) |
| Dates | dayjs (`src/utils/date-format.ts`) |
| Utilities | `@vueuse/core`, `clsx`, `tailwind-merge`, `class-variance-authority` |

Package manager: **pnpm**.

## Scripts

From `package.json`:

```bash
pnpm dev          # Vite dev server
pnpm build        # vue-tsc --noEmit && vite build
pnpm preview      # preview the production build
pnpm typecheck    # vue-tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest (watch mode)
pnpm lint         # eslint .
pnpm format       # prettier --write .
```

## Environment Variables

Declared in `env.d.ts` (all optional, read via `import.meta.env`):

`VITE_APP_NAME`, `VITE_API_BASE_URL`, `VITE_APP_ENDPOINT` (Socket.IO),
`VITE_LANGUAGE_CODE`, `VITE_HMAC_SECRET`, `VITE_BUILD_VERSION`.

`VITE_API_BASE_URL` defaults to `https://jsonplaceholder.typicode.com` so the
starter runs unconfigured (see `src/services/init-services.ts`).

## Key Constraints

- **Auto-registration is scoped**: only `src/components/ui/` is auto-registered
  by `unplugin-vue-components`; everything else stays an explicit import
  (`vite.config.ts`).
- **HMAC is a `VITE_*` secret** — exposed to every browser client. For
  production, sign on a server/BFF; the in-browser signer is a development
  convenience (see notes in `src/composables/useSocketIO.ts`).
- **Refresh token is server-owned** — it lives in an httpOnly cookie; only the
  short-lived access token is held client-side (in `localStorage`).
- **File size** — aim for ≤ ~200 LOC per file; split early.

## Intentionally NOT Included

- No global auth guard / protected routes (router has plain public routes).
- No state-persistence plugin for Pinia.
- No SSR (helpers guard `window`, but the app is a pure SPA).
- No component library beyond a small `ui/` set (Button, Input, Badge, Card).
- No CI workflow or deployment config in this template layer.

## Related Documentation

- [codebase-summary.md](./codebase-summary.md) — where things live
- [code-standards.md](./code-standards.md) — how to write code here
- [system-architecture.md](./system-architecture.md) — bootstrap, data flow, auth
- [README.md](./README.md) — full documentation map
