# Codebase Summary

Quick orientation for agents. Each section links to a detailed sub-doc.

## Sections

- [Directory Structure](./codebase-summary/directory-structure.md)
- [Services and Stores](./codebase-summary/services-and-stores.md)
- [Conventions](./codebase-summary/conventions.md)

## At a Glance

```
app/                     # Expo Router file-based routes
├── _layout.tsx          # Root layout: initServices → providers → navigation
├── (auth)/              # Unauthenticated group (login screen)
└── (app)/               # Authenticated group (home, profile, etc.)

src/
├── components/ui/       # NativeWind primitives (Button, Input, Card, Text)
├── enums/               # STORAGE_KEYS, Socket event registry
├── i18n/                # react-i18next setup + en/ja locales
├── providers/           # React context providers (QueryClientProvider)
├── services/            # Axios service layer
│   ├── core/            # Api, interceptors, HMAC, SecureStore, TanStack helpers
│   ├── auth/            # AuthModel + query/mutation definitions
│   ├── users/           # UsersModel + useUsersListQuery
│   └── init-services.ts # Wire base URLs, interceptors, onSessionExpired
├── stores/              # Zustand stores (auth, socket-io)
├── styles/              # global.css (Tailwind entry for NativeWind)
└── __tests__/           # jest-expo suite (helpers + unit + integration)
```
