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
│   ├── layout.tsx        # Root layout (RSC) — wraps in <Providers>
│   ├── providers.tsx     # "use client": QueryClient + i18n + initServices
│   ├── globals.css       # Tailwind v4 + shadcn tokens + .dark
│   ├── page.tsx          # Home page ("use client")
│   ├── counter/page.tsx  # Zustand counter ("use client")
│   ├── users/page.tsx    # React Query users ("use client")
│   └── form/page.tsx     # react-hook-form + zod ("use client")
├── components/ui/        # shadcn/ui primitives (button, badge, card, input, form-field)
├── stores/               # Zustand stores (counter)
├── server/               # SSR helpers (RSC/async component only)
│   ├── server-api.ts     # serverApiGet<T>() — SSR fetch with auth cookies + HMAC
│   ├── get-me.ts         # getMeServerData() — fetch current user server-side
│   └── get-users.ts      # getUsersServerData() — fetch users list server-side
├── services/             # Axios service layer (client-side only)
│   ├── core/             # Api, interceptors, HMAC, tanstack helpers
│   ├── auth/             # AuthModel + query/mutation definitions, contract
│   ├── users/            # UsersModel + useUsersListQuery, contract
│   ├── query-keys.ts     # Aggregated React Query keys from service contracts
│   ├── index.ts          # Barrel export
│   └── init-services.ts  # Wire baseURLs + interceptors (called in useEffect)
├── i18n/                 # react-i18next setup + en/ja locales
├── enums/                # STORAGE_KEYS registry (NEXT_PUBLIC_APP_NAME prefix)
├── lib/                  # cn() utility
├── hooks/                # Custom React hooks (useAppVersion)
└── __tests__/            # Vitest suite (helpers + unit + integration)
    ├── helpers/          # http-mocks, fake-http (no storage tests — tokens are httpOnly)
    ├── unit/             # hmac-signature, headers-utils, api, model, refresh-token-manager, tanstack, query-keys
    └── integration/      # auth-service, interceptors-refresh
```
