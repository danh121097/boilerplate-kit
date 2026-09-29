# Codebase Summary

Quick orientation for agents. Each section links to a detailed sub-doc.

## Sections

- [Directory Structure](./codebase-summary/directory-structure.md)
- [Services and Stores](./codebase-summary/services-and-stores.md)
- [Conventions](./codebase-summary/conventions.md)

## At a Glance

```
src/
├── app/                  # Next.js App Router
│   ├── layout.tsx        # Root layout (RSC) — <Providers>, <SiteHeader>, <SessionAlert>
│   ├── providers.tsx     # "use client": QueryClient + i18n + initServices
│   ├── globals.css       # Tailwind v4 + shadcn tokens + .dark
│   ├── not-found.tsx     # 404 page (localized)
│   ├── page.tsx          # Home + dialog demo ("use client")
│   ├── counter/page.tsx  # Zustand counter ("use client")
│   ├── login/            # Login page (react-hook-form + zod)
│   ├── users/page.tsx    # Server prefetch → users-list-client.tsx (React Query)
│   └── form/page.tsx     # react-hook-form + zod ("use client")
├── proxy.ts              # Route guard (guest → /login?redirect=…)
├── components/           # site-header, socket-status, session-banner, mock-auth-badge
│   └── ui/               # shadcn/ui primitives (button, badge, card, input, form-field, dialog)
├── stores/               # Zustand stores (counter, socket-io)
├── server/               # SSR helpers (RSC/async component only)
│   ├── server-api.ts     # serverApiGet / serverApiPaginate — SSR fetch with auth cookies + HMAC
│   ├── session.ts        # readServerSession() — current user server-side
│   ├── get-users.ts      # getUsersServerData() — users list (PaginatedResponse<User>)
│   ├── hydrated-queries.tsx # prefetch + HydrationBoundary wrapper
│   └── query-client.ts   # per-request QueryClient
├── services/             # Axios service layer (client-side only)
│   ├── core/             # Api, interceptors, HMAC, tanstack helpers
│   ├── auth/             # AuthModel + query/mutation definitions, contract
│   ├── users/            # UsersModel + useUsersListQuery, contract
│   ├── query-keys.ts     # Aggregated React Query keys from service contracts
│   ├── index.ts          # Barrel export
│   └── init-services.ts  # Wire baseURLs + interceptors (called in useEffect)
├── i18n/                 # react-i18next setup + en/ja locales
├── enums/                # STORAGE_KEYS registry (NEXT_PUBLIC_APP_NAME prefix)
├── utils/                # cn(), cookie storage, date format
├── hooks/                # useSocketIO
└── __tests__/            # Vitest suite (helpers + unit + integration)
    ├── helpers/          # http-mocks, session-browser, fake-web-locks, render-with-i18n (no storage tests — tokens are httpOnly)
    ├── unit/             # core + server helpers, route guard, login schema, session banner, not-found + users page render
    └── integration/      # auth service, refresh interceptors, mock auth/users, session flows (auth, refresh failure, logout race, cross-tab, revoke, cache observers)
```
