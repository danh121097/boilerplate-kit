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
├── services/             # Axios service layer (client-side only)
│   ├── core/             # Api, interceptors, HMAC, SSR-guarded token storage, tanstack helpers
│   ├── auth/             # AuthModel + query/mutation definitions
│   ├── users/            # UsersModel + useUsersListQuery
│   ├── index.ts          # Barrel export
│   └── init-services.ts  # Wire baseURLs + interceptors (called in useEffect)
├── i18n/                 # react-i18next setup + en/ja locales
├── enums/                # STORAGE_KEYS registry (NEXT_PUBLIC_APP_NAME prefix)
├── lib/                  # cn() utility
├── hooks/                # Custom React hooks (useAppVersion)
└── __tests__/            # Vitest suite (helpers + unit + integration)
    ├── helpers/          # fake-storage, http-mocks
    ├── unit/             # auth-token-storage, hmac, headers, api, model, refresh-manager, tanstack
    └── integration/      # auth-service, interceptors-refresh
```
