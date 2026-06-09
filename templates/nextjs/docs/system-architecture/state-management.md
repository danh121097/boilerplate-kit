# State Management

## Client State — Zustand

`stores/counter.ts` provides a simple counter with `increment`, `decrement`,
and `reset`. Import explicitly (no auto-import):

```ts
import { useCounterStore } from "@/stores/counter";
```

Zustand stores are module-level singletons — safe across re-renders, reset on
full page reload.

## Server State — TanStack React Query

React Query manages all async data. Service layer queries are defined with
`defineQuery` and mutations with `defineMutation` from `src/services/core/tanstack.ts`.

```ts
// Define once:
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: async () => (await UsersModel.list()).data,
});

// Use in a "use client" component:
const { data, isLoading, error } = useUsersListQuery();
```

The `QueryClient` is created once per browser session in `app/providers.tsx`.
On the server a new client is created per request (isolation).

## i18n State — react-i18next

`initI18n()` sets up i18next with en/ja locales. The active locale is persisted
to `STORAGE_KEYS.LANGUAGE` in localStorage (SSR-guarded). Switching locale:

```ts
import { setLocale } from "@/i18n/i18n";
setLocale("ja"); // changes language + persists to localStorage
```
