# Project Overview — PDR

## Vision

A production-ready Next.js 16 + TypeScript SSR starter that teams can scaffold
once and extend. Ships with a full axios service layer (JWT bearer + httpOnly
refresh-token rotation + HMAC-signed requests), TanStack React Query, Zustand,
shadcn/ui + Tailwind v4, react-i18next, and a complete Vitest suite. The service
layer is SSR-guarded — safe to import anywhere, only touches browser APIs inside
`"use client"` components.

## Stack

| Concern | Choice | Version |
|---------|--------|---------|
| Framework | Next.js (App Router) | 16 |
| Language | TypeScript | 5.x strict |
| Data fetching | TanStack React Query | 5.x |
| State | Zustand | 5 |
| Forms | react-hook-form + zod | 7.x / 3.x |
| UI primitives | shadcn/ui (new-york) | latest |
| Styling | Tailwind CSS | v4 |
| HTTP | axios | 1.x |
| i18n | react-i18next + i18next | 15.x / 24.x |
| Tests | Vitest | 3.x |
| Package manager | pnpm | 9+ |

## Scripts

```bash
pnpm dev          # Next.js dev server (Turbopack)
pnpm build        # next build
pnpm start        # next start (production)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (node env)
pnpm test:watch   # vitest watch
pnpm lint         # eslint (flat config, jiti)
pnpm format       # prettier --write
```

## Constraints

- No `any` without explicit justification comment.
- `strict: true` in tsconfig; `isolatedModules: true` for Next.js compatibility.
- HMAC secret must match backend `HMAC_SECRET`; leave empty for backends without HMAC.
- Access tokens in localStorage (SSR-guarded); refresh token in httpOnly cookie (server-managed).
- Service layer is client-side only — never call service methods in RSC or server actions.
- File size target ≤ 200 LOC per file; split early.
- `NEXT_PUBLIC_*` prefix for all client-visible env vars.
