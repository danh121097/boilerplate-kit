# reactjs-starter

React 19 + TypeScript SPA starter — Vite, TanStack Router (file-based), TanStack
React Query, Zustand, shadcn/ui + Tailwind v4, JWT auth with httpOnly refresh-token
rotation and HMAC-signed requests, react-i18next (en/ja).

## Quick start

```bash
pnpm install
pnpm dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server with HMR |
| `pnpm build` | Type-check + production build |
| `pnpm typecheck` | TypeScript check only |
| `pnpm test` | Vitest (node env) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier |

## Stack

| Concern | Library |
|---------|---------|
| UI framework | React 19 |
| Build tool | Vite 6 |
| Router | TanStack Router (file-based) |
| Data fetching | TanStack React Query |
| State | Zustand 5 |
| Forms | react-hook-form + zod |
| UI primitives | shadcn/ui (Radix) |
| Styling | Tailwind CSS v4 |
| HTTP | axios (HMAC + JWT refresh) |
| i18n | react-i18next (en/ja) |

## Environment variables

Copy `.env.example` → `.env` and fill in the values:

```
VITE_APP_ENDPOINT=http://localhost:3000
VITE_API_PREFIX=/api/v1
VITE_APP_NAME=MY_APP
VITE_LANGUAGE_CODE=en
VITE_HMAC_SECRET=           # must match backend HMAC_SECRET
VITE_BUILD_VERSION=         # injected by CI
```

## Project structure

```
src/
├── routes/          # File-based TanStack Router routes
├── services/        # Axios service layer (core + auth + users)
├── stores/          # Zustand stores
├── components/ui/   # shadcn/ui primitives
├── providers/       # React context providers
├── i18n/            # react-i18next setup + locales
├── enums/           # Storage key registry
├── lib/             # cn() utility
├── hooks/           # Custom React hooks
└── __tests__/       # Vitest test suite
```

See [`docs/README.md`](./docs/README.md) for the full documentation map.
