# Architecture

## Stack Boundaries

| Layer            | Location                                    | Notes                                                    |
| ---------------- | ------------------------------------------- | -------------------------------------------------------- |
| App Router (RSC) | `src/app/layout.tsx`, `src/app/**/page.tsx` | Server components; no browser APIs                       |
| Client boundary  | `"use client"` directive                    | Required for hooks, effects, browser storage             |
| Service layer    | `src/services/`                             | Client-only; SSR-guarded via `isClient()`                |
| State            | `src/stores/` (Zustand), React Query        | Client-only                                              |
| UI primitives    | `src/components/ui/`                        | Mostly server-compatible; `button.tsx` is `"use client"` |

## Discovery Rules

Before changing code, identify:

- Is the file a RSC or a client component?
- Does it touch browser APIs (`window`, `document`, `localStorage`)? → Must be `"use client"`.
- Is it a service method call? → Must only happen client-side (effect, event handler, or hook).
- Is it server data fetching? → Use server helpers in `src/server/` (serverApiGet, getMeServerData, etc.).

## Core Domains

- **Auth** — `src/services/auth/` (login, register, logout, getMe, token lifecycle)
- **Users** — `src/services/users/` (list, get, update)
- **Counter** — `src/stores/counter.ts` (demo Zustand store)
- **i18n** — `src/i18n/` (en/ja locales, locale persistence)

## Key Invariants

1. Auth tokens (accessToken + refreshToken) are httpOnly cookies — the client never reads or stores them.
2. `initServices()` runs only in `useEffect` (browser), never during SSR.
3. Service models (`AuthModel`, `UsersModel`) are singletons set up at init time.
4. Single-flight refresh: concurrent 401s trigger exactly one `/auth/refresh` call.
5. Server Components use `serverApiGet<T>()` to fetch with forwarded auth cookies + HMAC.
6. Endpoints are single-sourced in `src/services/{auth,users}/contract.ts` (paths + React Query keys).
