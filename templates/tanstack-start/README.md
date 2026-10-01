# TanStack Start Starter

> **SSR-first** React starter. For a **SPA-first** React starter (Vite only, no SSR), see the `reactjs` template instead.

A production-ready TanStack Start v1 template with full-stack TypeScript, SSR,
and a battle-tested client service layer.

## Stack

| Concern         | Choice                                                                |
| --------------- | --------------------------------------------------------------------- |
| Framework       | **TanStack Start v1** (Vite plugin, SSR)                              |
| Router          | **TanStack Router** (file-based, built into Start)                    |
| Data fetching   | **TanStack React Query** (built into Start)                           |
| State           | **Zustand**                                                           |
| Forms           | **react-hook-form + zod**                                             |
| UI              | **shadcn/ui (Radix) + Tailwind v4**                                   |
| HTTP            | **axios** + httpOnly JWT cookies (access + refresh) + HMAC            |
| i18n            | **react-i18next** (en / ja, persisted in a cookie so SSR reads it)    |
| Tests           | **vitest** (node env, SSR-null cases included)                        |
| Package manager | **pnpm**                                                              |

## Quick start

```bash
pnpm install
cp .env.example .env   # fill in VITE_APP_ENDPOINT etc.
pnpm dev               # SSR dev server on http://localhost:5173
```

Run one starter at a time: `reactjs` also uses port 5173, and the bundled backends'
dev CORS list allows only 5173, 9000 and 4321.

## Scripts

| Command          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `pnpm dev`       | Vite dev server (HMR + SSR)                                          |
| `pnpm build`     | Type-check + production SSR build                                    |
| `pnpm start`     | Node production server (srvx) for `dist/`: SSR handler + `dist/client` assets |
| `pnpm typecheck` | `tsc --noEmit`                                                       |
| `pnpm test`      | Vitest (node env)                                                    |
| `pnpm test:watch`| Vitest watch mode                                                    |
| `pnpm lint`      | ESLint + `prettier --check` (read-only)                              |
| `pnpm lint:fix`  | ESLint `--fix` + `prettier --write`                                  |
| `pnpm format`    | `prettier --write`                                                   |

## Environment variables

Copy `.env.example` to `.env`. `VITE_*` values are inlined at build time.

| Variable                   | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `VITE_APP_NAME`            | Prefix for cookie and localStorage keys                                 |
| `VITE_APP_ENDPOINT`        | Backend origin (REST base = origin + prefix; Socket.IO uses it bare)    |
| `VITE_API_PREFIX`          | REST prefix, default `/api/v1`                                          |
| `VITE_LANGUAGE_CODE`       | Default locale (`en`) when no language cookie is set                    |
| `VITE_HMAC_SECRET`         | Required by the bundled backends; must equal the backend `HMAC_SECRET` (empty logs a dev warning) |
| `VITE_BUILD_VERSION`       | Injected by CI for the `x-version` header                               |
| `VITE_AUTH_MOCK`           | Optional, dev only: `true` answers `/auth/*` and `/users` without a backend |
| `VITE_AUTH_MOCK_EMAIL`     | Optional, dev only: demo user email (`demo@example.com`)                |
| `VITE_AUTH_MOCK_PASSWORD`  | Optional, dev only: demo user password (`password`)                     |

## Structure

```
src/
├── routes/          # File-based TanStack Router routes (+ routeTree.gen.ts)
├── server/          # createServerFn handlers (server-only)
├── services/        # Axios service layer (core + auth + users), client-only
├── stores/          # Zustand stores
├── components/      # not-found, socket-status, mock-auth-badge; ui/ = shadcn/ui primitives
├── i18n/            # react-i18next setup + locales
├── enums/           # Storage key registry
├── utils/           # cn(), cookie storage, date helpers
├── hooks/           # Custom React hooks (Socket.IO)
└── __tests__/       # Vitest suite
```

Routes: `/` (locale toggle, dialog demo), `/counter` (Zustand), `/users` (list
seeded by an SSR loader + `createServerFn`), `/form` (react-hook-form + zod),
`/login`. Unknown URLs render the root not-found page.

## SSR vs SPA

|                  | TanStack Start (this template)      | reactjs template |
| ---------------- | ----------------------------------- | ---------------- |
| Rendering        | SSR + client hydration              | SPA (client-only) |
| Entry points     | generated by the Start Vite plugin (`getRouter()` in `src/router.tsx`) | `src/main.tsx` |
| Config           | `vite.config.ts`                    | `vite.config.ts` |
| Server functions | `createServerFn` in `src/server/`   | n/a              |
| Service layer    | Client-only (SSR-guarded)           | Client-only      |

## Service layer and SSR safety

The axios service layer (`src/services/`) is **client-only**. Every `localStorage`,
`document` or `window` access is guarded with `typeof window !== "undefined"`, so on
the server it returns `null` or does nothing. Server functions in `src/server/`
fetch data directly without the client token registry.

## Session and users behavior

- The login form validates with zod (`email`, a non-empty `password`; strength rules
  belong on register), shows messages from i18n, and shows a server failure in a
  `role="alert"` element.
- If restoring the session fails for a transient reason (offline, timeout, 5xx), the
  user keeps their state and a banner offers a retry; a 401 or 404 on `/auth/me` is a
  normal sign-out (see [Boot](./docs/system-architecture/security-auth.md#boot)).
- `AuthUser` is the `User` type; `Role` is `"user" | "admin" | "super_admin"`.
- `UsersModel`-backed `useUsersListQuery` returns the paginated envelope
  (`{ data, meta }`); `/users` shows an empty state when the list is empty.

## Generated files

`src/routeTree.gen.ts` (TanStack Router) and `auto-imports.d.ts`
(unplugin-auto-import) are regenerated on every `dev` or `build` run and
committed as cold-typecheck stubs. Never edit them manually.

## Mock auth

See [Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration):
mock mode answers auth and users before the backend exists; the flag is ignored in
production builds.

## Docs

See [`docs/README.md`](./docs/README.md) for the documentation map and read order.
