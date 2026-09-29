# Next.js Starter

**Next.js 16 + TypeScript SSR starter** — App Router, TanStack React Query,
Zustand, shadcn/ui + Tailwind v4, JWT auth with HMAC-signed requests.

## Stack

| Concern         | Choice                  |
| --------------- | ----------------------- |
| Framework       | Next.js 16 (App Router) |
| Language        | TypeScript 6 (strict)   |
| Data fetching   | TanStack React Query 5  |
| State           | Zustand 5               |
| Forms           | react-hook-form + zod 4 |
| UI primitives   | shadcn/ui (new-york)    |
| Styling         | Tailwind CSS v4         |
| HTTP            | axios 1.x               |
| i18n            | react-i18next (en/ja)   |
| Tests           | Vitest 4 (node env)     |
| Package manager | pnpm                    |

## Quick start

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:9000](http://localhost:9000).

## Scripts

| Script           | Does                                                   |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Next.js dev server (Turbopack, port 9000)              |
| `pnpm build`     | Production build (`next build`)                        |
| `pnpm start`     | Serve the production build                             |
| `pnpm typecheck` | `tsc --noEmit`                                         |
| `pnpm test`      | Vitest (node env)                                      |
| `pnpm lint`      | `eslint . && prettier --check .` (read-only)           |
| `pnpm lint:fix`  | `eslint . --fix && prettier --write .`                 |
| `pnpm format`    | `prettier --write .`                                   |

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                    | Description                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ENDPOINT`  | Backend origin (REST base = origin + /api/v1; Socket.IO uses it bare)        |
| `NEXT_PUBLIC_API_PREFIX`    | REST version prefix appended to the endpoint (default `/api/v1`)             |
| `NEXT_PUBLIC_APP_NAME`      | Prefix for cookie, storage and lock keys (default `PRISM_APP`)               |
| `NEXT_PUBLIC_LANGUAGE_CODE` | Default locale (`en` or `ja`) when no language cookie is set                 |
| `NEXT_PUBLIC_HMAC_SECRET`   | HMAC signing secret (must match backend)                                     |
| `NEXT_PUBLIC_BUILD_VERSION` | Version string sent as `x-version` header                                    |
| `NEXT_PUBLIC_AUTH_MOCK`     | Optional, dev only: `true` answers `/auth/*` and `/users` before the backend exists (ignored in production builds) |
| `NEXT_PUBLIC_AUTH_MOCK_EMAIL` / `NEXT_PUBLIC_AUTH_MOCK_PASSWORD` | Mock login credentials (default `demo@example.com` / `password`) |

## Structure

```
src/
├── app/           # App Router: layout, providers, pages (/, /counter, /login, /users, /form), not-found
├── proxy.ts       # Route guard (guest → /login?redirect=…)
├── components/    # site-header, session-banner, ui/ (shadcn primitives incl. dialog)
├── server/        # SSR helpers (RSC only): server-api, session, hydrated queries
├── services/      # Axios service layer (client only): core, auth, users
├── stores/        # Zustand stores (counter, socket-io)
├── hooks/         # useSocketIO
├── i18n/          # react-i18next setup + en/ja locales
├── enums/         # storage keys, socket events
├── utils/         # cn, cookie storage, date format
└── __tests__/     # Vitest suite (helpers, unit, integration)
```

## Routes

| Path       | Description                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `/`        | Home + dialog demo (`@radix-ui/react-dialog` via shadcn `dialog.tsx`)        |
| `/counter` | Zustand counter (client)                                                    |
| `/login`   | Sign in — react-hook-form + zod (email, password ≥ 8), server error alert    |
| `/users`   | Guarded user list — server prefetch + hydrate, `PaginatedResponse<User>`, empty state |
| `/form`    | react-hook-form + zod validation                                            |
| other      | Localized "Page not found" (`app/not-found.tsx`)                             |

## SSR safety

The axios service layer is **client-side only**. `window`, `document` and
storage access is guarded (`typeof window !== "undefined"`); service
initialization happens at module load of the `"use client"` `Providers`
component, never during SSR. Server Components read data through
`src/server/server-api.ts` (forwards the access cookie + HMAC) and never refresh
a session — a failed prefetch is not dehydrated, so the client query refetches
through axios, which can refresh.

## Session unavailable

If restoring the session fails for a transient reason (network error, timeout,
5xx), the user stays as they were and a banner (`session.unavailable`, with a
`session.retry` button) appears above the page; it disappears once a retry
succeeds. A 401 is the normal signed-out flow and shows no banner.

## Architecture

See [`docs/system-architecture.md`](./docs/system-architecture.md) for the full
architecture reference including App Router / RSC boundaries, the service layer,
auth token lifecycle, and HMAC signing.

## Mock auth (before backend integration)

Set `NEXT_PUBLIC_AUTH_MOCK=true` to answer `/auth/*` and `/users` in dev before
the backend exists. See
[Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration):
mock mode answers auth and users; the flag is ignored in production builds.

## Docs

All documentation lives in [`docs/`](./docs/README.md) — start with the map.
