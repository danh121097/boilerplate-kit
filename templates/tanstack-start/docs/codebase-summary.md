# Codebase Summary

Quick orientation for agents. Each section links to a detailed sub-doc.

## Sections

- [Directory Structure](./codebase-summary/directory-structure.md)
- [Services and Stores](./codebase-summary/services-and-stores.md)
- [Conventions](./codebase-summary/conventions.md)

## At a Glance

```
src/
├── main.tsx              # App entry: initServices → providers → RouterProvider
├── router.tsx            # TanStack Router + QueryClient context
├── routes/               # File-based routes (__root, index, counter, users, form)
├── providers/            # React context providers (QueryClient)
├── components/ui/        # shadcn/ui primitives (button, badge, card, input, form-field)
├── stores/               # Zustand stores (counter)
├── services/             # Axios service layer
│   ├── core/             # Api, interceptors, HMAC, token storage, tanstack helpers
│   ├── auth/             # AuthModel + query/mutation definitions
│   └── users/            # UsersModel + useUsersListQuery
├── i18n/                 # react-i18next setup + en/ja locales
├── enums/                # STORAGE_KEYS registry
├── lib/                  # cn() utility
├── hooks/                # Custom React hooks
└── __tests__/            # Vitest suite (helpers + unit + integration)
```
