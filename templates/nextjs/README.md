# Next.js Starter

**Next.js 16 + TypeScript SSR starter** — App Router, TanStack React Query,
Zustand, shadcn/ui + Tailwind v4, JWT auth with HMAC-signed requests.

## Stack

| Concern         | Choice                  |
| --------------- | ----------------------- |
| Framework       | Next.js 16 (App Router) |
| Language        | TypeScript 5 (strict)   |
| Data fetching   | TanStack React Query 5  |
| State           | Zustand 5               |
| Forms           | react-hook-form + zod   |
| UI primitives   | shadcn/ui (new-york)    |
| Styling         | Tailwind CSS v4         |
| HTTP            | axios 1.x               |
| i18n            | react-i18next (en/ja)   |
| Tests           | Vitest 3 (node env)     |
| Package manager | pnpm                    |

## Quick Start

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev          # Next.js dev server (Turbopack)
pnpm build        # Production build
pnpm start        # Serve production build
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest (node env)
pnpm lint         # ESLint
pnpm format       # Prettier
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                    | Description                               |
| --------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_APP_ENDPOINT`   | Backend origin (REST base = origin + /api/v1; Socket.IO uses it bare) |
| `NEXT_PUBLIC_API_PREFIX`    | REST version prefix appended to the endpoint (default `/api/v1`) |
| `NEXT_PUBLIC_APP_NAME`      | Prefix for localStorage keys              |
| `NEXT_PUBLIC_LANGUAGE_CODE` | Default locale (`en` or `ja`)             |
| `NEXT_PUBLIC_HMAC_SECRET`   | HMAC signing secret (must match backend)  |
| `NEXT_PUBLIC_BUILD_VERSION` | Version string sent as `x-version` header |

## Routes

| Path       | Description                                     |
| ---------- | ----------------------------------------------- |
| `/`        | Home + locale toggle                            |
| `/counter` | Zustand counter (client)                        |
| `/users`   | User list via React Query + axios service layer |
| `/form`    | react-hook-form + zod validation                |

## SSR Safety

The axios service layer is **client-side only**. All `localStorage` and `window`
access is guarded with `typeof window !== "undefined"` checks (mirroring the
nuxtjs template). Service initialization happens in the `"use client"` Providers
component via `useEffect`, never during SSR.

## Architecture

See [`docs/system-architecture.md`](./docs/system-architecture.md) for the full
architecture reference including App Router / RSC boundaries, the service layer,
auth token lifecycle, and HMAC signing.
