# Codebase Summary

Quick orientation for agents. Each section links to a detailed sub-doc.

## Sections

- [Directory Structure](./codebase-summary/directory-structure.md)
- [Services and Stores](./codebase-summary/services-and-stores.md)
- [Conventions](./codebase-summary/conventions.md)

## At a Glance

```
src/
├── main.tsx              # Legacy SPA entry (not used in Vite-based SSR)
├── router.tsx            # getRouter() factory: TanStack Router + QueryClient
│                          # setupRouterSsrQueryIntegration dehydrates/hydrates
├── routes/               # File-based routes (__root, index, counter, users, form)
│                          # loaders: queryClient.ensureQueryData(queryOptions)
├── server/               # createServerFn handlers (server-only, no axios)
│                          # e.g. getUsersServerFn() — direct fetch, no auth layer
├── components/ui/        # shadcn/ui primitives (button, badge, card, input, form-field)
├── stores/               # Zustand stores (counter)
├── services/             # Axios service layer (client-only, SSR-guarded)
│   ├── core/             # Api, interceptors, HMAC, token storage, tanstack helpers
│   ├── auth/             # AuthModel + query/mutation definitions
│   └── users/            # UsersModel + useUsersListQuery
├── i18n/                 # react-i18next setup + en/ja locales
├── enums/                # STORAGE_KEYS registry
├── lib/                  # cn() utility
├── hooks/                # Custom React hooks
└── __tests__/            # Vitest suite (helpers + unit + integration + ssr)
```
