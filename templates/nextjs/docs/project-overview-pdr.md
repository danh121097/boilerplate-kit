# Project Overview — PDR

## Vision

A production-ready Next.js 16 + TypeScript SSR starter that teams can scaffold
once and extend. Ships with a cookie-first auth model (httpOnly accessToken +
refreshToken rotation + HMAC-signed requests), a full axios service layer for
client-side data fetching, server helpers for RSC data resolution, TanStack React
Query, Zustand, shadcn/ui + Tailwind v4, react-i18next, and a complete Vitest suite.
Auth is transparent to the client — no token storage code, just `withCredentials: true`
and the browser handles cookies.

## Stack

| Concern         | Choice                  | Version     |
| --------------- | ----------------------- | ----------- |
| Framework       | Next.js (App Router)    | 16          |
| Language        | TypeScript              | 6.x strict  |
| Data fetching   | TanStack React Query    | 5.x         |
| State           | Zustand                 | 5           |
| Forms           | react-hook-form + zod   | 7.x / 4.x   |
| UI primitives   | shadcn/ui (new-york)    | latest      |
| Styling         | Tailwind CSS            | v4          |
| HTTP            | axios                   | 1.x         |
| i18n            | react-i18next + i18next | 15.x / 24.x |
| Tests           | Vitest                  | 4.x         |
| Package manager | pnpm                    | 9+          |

## Scripts

```bash
pnpm dev          # Next.js dev server (Turbopack)
pnpm build        # next build
pnpm start        # next start (production)
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run (node env)
pnpm test:watch   # vitest watch
pnpm lint         # eslint + prettier --check (read-only)
pnpm lint:fix     # eslint --fix + prettier --write
pnpm format       # prettier --write
```

## Constraints

- No `any` without explicit justification comment.
- `strict: true`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch` and `verbatimModuleSyntax` in tsconfig (type-only imports use `import type`); `isolatedModules: true` for Next.js compatibility.
- `NEXT_PUBLIC_HMAC_SECRET` is required by the bundled backends and must equal the backend `HMAC_SECRET`; empty makes every request 401 (the dev console warns once).
- Both tokens (accessToken + refreshToken) are httpOnly cookies, server-managed. Client never reads them.
- Service layer is client-side only — never call service methods in RSC or server actions.
- Server Components use `serverApiGet()` helpers for auth-protected data (forwards cookies + HMAC).
- File size target ≤ 200 LOC per file; split early.
- `NEXT_PUBLIC_*` prefix for all client-visible env vars.
- `suppressHydrationWarning` on `<html>` and `<body>` in root layout (client-decided `lang` + browser-extension-mutated attributes are not real hydration mismatches).
