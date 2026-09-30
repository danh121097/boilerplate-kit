# React starter

React 19 + TypeScript SPA starter built with Vite. Production-grade structure mirroring a real codebase — services + routing + i18n + form validation + UI components — kept lean enough to read in one sitting.

## Stack

| Concern       | Choice                                                                 |
| ------------- | ---------------------------------------------------------------------- |
| Framework     | React 19 + TypeScript                                                  |
| Bundler       | Vite 8                                                                 |
| Routing       | TanStack Router (file-based)                                           |
| Client state  | Zustand                                                                |
| Server state  | TanStack React Query + `defineQuery`/`defineMutation` helpers          |
| HTTP          | Axios + class-based `Api` + interceptors (JWT refresh, optional HMAC)  |
| UI primitives | shadcn/ui (Radix) — `Button`, `Card`, `Input`, `FormField`, `Badge`, `Dialog` |
| Styles        | Tailwind v4 (`@tailwindcss/vite`) with shadcn tokens                   |
| Forms         | react-hook-form + zod via `@hookform/resolvers`                        |
| i18n          | react-i18next (en + ja locales bundled)                                |
| Auto-imports  | `unplugin-auto-import`                                                 |
| Tests         | Vitest                                                                 |
| Lint / format | ESLint flat config (TS) + Prettier                                     |

## Quick start

```sh
pnpm install
pnpm dev
```

The first `pnpm dev` (or `pnpm build`) regenerates `src/routeTree.gen.ts` and `auto-imports.d.ts`.

## Scripts

| Script            | What it does                                 |
| ----------------- | -------------------------------------------- |
| `pnpm dev`        | Vite dev server with HMR                     |
| `pnpm build`      | `tsc -b` + production Vite build             |
| `pnpm preview`    | Preview the production build                 |
| `pnpm typecheck`  | `tsc -b`                                     |
| `pnpm test`       | Vitest (`vitest run`, node env)              |
| `pnpm test:watch` | Vitest in watch mode                         |
| `pnpm lint`       | Read-only: `eslint .` + `prettier --check .` |
| `pnpm lint:fix`   | `eslint . --fix` + `prettier --write .`      |
| `pnpm format`     | `prettier --write .`                         |

## Env

Copy `.env.example` → `.env` and fill in the values.

| Variable                  | Default                 | Notes                                                                    |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `VITE_APP_ENDPOINT`       | `http://localhost:3000` | Backend origin                                                           |
| `VITE_API_PREFIX`         | `/api/v1`               | API path prefix                                                          |
| `VITE_APP_NAME`           | `PRISM_APP`             | Prefix for localStorage keys and lock names                              |
| `VITE_LANGUAGE_CODE`      | `en`                    | Fallback locale when nothing is saved in `localStorage`                  |
| `VITE_HMAC_SECRET`        | unset                   | Optional. Enables HMAC-signed requests; must match backend `HMAC_SECRET` |
| `VITE_BUILD_VERSION`      | `1.0.0`                 | Optional. Sent as `x-version` when signing; injected by CI               |
| `VITE_AUTH_MOCK`          | unset                   | Optional, dev only. `true` answers `/auth/*` and `/users` in the browser |
| `VITE_AUTH_MOCK_EMAIL`    | `demo@example.com`      | Optional, dev only. Demo account email                                   |
| `VITE_AUTH_MOCK_PASSWORD` | `password`              | Optional, dev only. Demo account password                                |

## Structure

```
src/
├── main.tsx                      # bootstraps services + i18n, mounts the router
├── router.tsx                    # createRouter + QueryClient context
├── routes/                       # file-based TanStack Router routes (+ generated routeTree.gen.ts)
├── components/
│   ├── ui/                       # auto-imported primitives (Button, Card, Dialog, …)
│   ├── logout-button.tsx         # nav logout (useLogoutMutation)
│   ├── not-found.tsx             # root notFoundComponent
│   └── socket-status.tsx         # header realtime dot; opens the socket while signed in
├── hooks/                        # auto-imported (useSocketIO)
├── enums/                        # STORAGE_KEYS (prefixed by VITE_APP_NAME) + socket events
├── i18n/
│   └── locales/                  # en.ts, ja.ts
├── providers/                    # QueryClient provider
├── services/
│   ├── core/                     # api.ts, model.ts, interceptors.ts, tanstack.ts, …
│   ├── auth/                     # AuthModel, login-schema (zod)
│   ├── users/                    # UsersModel (paginated list) + `useUsersListQuery`
│   └── init-services.ts          # called from main.tsx before render
├── stores/                       # Zustand — explicit imports (`import { useXStore } from "@/stores/x"`)
├── styles/                       # tailwind.css (tokens) + main.css
├── utils/                        # cn (class merge), date-format — auto-imported
└── __tests__/                    # Vitest suite (helpers + unit + integration)
```

## Auto-imports

- `react` hooks, `react-i18next`, the router's runtime helpers and Zustand's `create` are auto-imported in every `.ts`/`.tsx` file. Route-definition APIs (`createFileRoute`, …) stay explicit.
- Files under `src/hooks/**`, `src/utils/**` and `src/components/ui/**` are auto-imported by named export. Stores stay explicit.

## Services layer

`src/services/core/` mirrors a production setup:

- `Api` — class-based axios client with multi-service support, lazy interceptor registration and `get` / `paginate` / `cursorPaginate` / `post` / `put` / `patch` / `delete` helpers.
- `ApiInterceptors` — request interceptor injects the bearer token + optional HMAC headers; response interceptor unwraps `{ success, data, ... }` envelopes and, on 401, refreshes once (single-flight, cross-tab locked) and replays; login/register/logout 401s are never refreshed, and a refused refresh routes to `/login` instead of reloading.
- `HMACSignatureGenerator` — produces `sig` / `ctime` / `x-version` headers on HTTP requests, and `sig` / `ctime` on the socket handshake, only when `VITE_HMAC_SECRET` is set. The secret ships in the bundle, so this is anti-casual-abuse only, not authentication.
- `Model` — base class for domain models; subclass and call `Model.setup({ path, service })`.
- `defineQuery` / `defineMutation` — typed wrappers around TanStack React Query with a consistent error type.

Example domain service in `src/services/users/users.ts`. `list` returns the backend's paginated envelope (`PaginatedResponse<User>`: `{ success, data, meta }`); `get` / `update` return the unwrapped `User`:

```ts
export class UsersModel extends Model {
  static list(params?: PaginationParams): Promise<PaginatedResponse<User>> {
    return this.api.paginate<User>({ url: usersContract.paths.list, params });
  }
}
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => UsersModel.list(),
});
```

Pages read `data.data` and render `users.empty` when the list is empty.

Session restore: if reading the profile at boot fails for a reason other than a 401 (offline, timeout, 5xx), the session is kept, `useAuthStore` sets `hydrateError`, and the root layout shows a `role="alert"` banner (`session.unavailable`) with a `session.retry` button that calls `retryHydrate()`. A 401 is the normal logged-out flow and shows no banner.

## i18n

Locale stored in `localStorage` under `STORAGE_KEYS.LANGUAGE` (access is wrapped in try/catch), falling back to `VITE_LANGUAGE_CODE`, then `en`. Switch via `setLocale("ja")` (see the nav button in `routes/__root.tsx`). Bundled locales: `en`, `ja`. Validation messages and the not-found page come from the locale files.

## Forms

`react-hook-form` + `zod` via `@hookform/resolvers`. See `routes/login.tsx` and `routes/form.tsx` for the canonical pattern; `services/auth/login-schema.ts` holds the schema, whose messages are i18n keys translated where they render.

## Theme

Layouts and components use the shadcn tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-primary`, …) with a neutral palette. The `.dark` block exists in `tailwind.css`, but no dark-mode toggle is provided.

## Routes

- `/` — welcome + Radix dialog demo
- `/counter` — Zustand store demo
- `/users` — protected; TanStack Query demo via `UsersModel.list()` + `Badge`, with an empty state
- `/form` — react-hook-form + zod demo with `Button` + `FormField` + `Card` + `Badge`
- `/login` — guests only; react-hook-form + zod, server error shown in a `role="alert"` element
- any unknown URL — root `notFoundComponent` (`components/not-found.tsx`)

## Mock auth

Set `VITE_AUTH_MOCK=true` (dev only) to answer `/auth/*` and `/users` in the browser before the backend exists; the flag is ignored in production builds. See [Mock auth](./docs/system-architecture/security-auth.md#mock-auth-before-backend-integration).

## Docs

This template is agent-ready out of the box:

- [`AGENTS.md`](./AGENTS.md) — agent entry point + reading list (Claude Code, Codex, Cursor, …).
- [`CLAUDE.md`](./CLAUDE.md) — Claude Code guidance for this project.
- [`docs/`](./docs/README.md) — full map: project overview, codebase summary, code standards, system architecture, and design guidelines.
