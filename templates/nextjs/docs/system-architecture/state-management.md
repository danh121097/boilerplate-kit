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
// Define once (client axios query, returns the PaginatedResponse envelope):
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: queryKeys.users.list,
  fetcher: () => UsersModel.listPaginated(),
});

// Use in a "use client" component (read the array from `data.data`):
const { data, isLoading, error } = useUsersListQuery();
```

### SSR-first reads — prefetch + hydrate

Read pages are server-rendered, not client-fetched. A Server Component prefetches
the query ON THE SERVER (forwarded httpOnly cookie via `getUsersServerData`),
dehydrates the cache, and a `<HydrationBoundary>` hands it to the client query —
which renders on first paint with no refetch, then owns refetch/invalidation:

```tsx
// app/users/page.tsx — Server Component
export const dynamic = "force-dynamic"; // reads auth cookies per request

export default async function UsersPage() {
  const queryClient = getServerQueryClient(); // cache()'d per request
  await queryClient.prefetchQuery({
    queryKey: [queryKeys.users.list],          // same key the client hook uses
    queryFn: () => getUsersServerData(),        // server fetch (next/headers)
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UsersListClient /> {/* "use client": reads useUsersListQuery */}
    </HydrationBoundary>
  );
}
```

The prefetch (server, `next/headers`) and the client query (axios) are SEPARATE
fetchers on ONE key — they agree because both return `PaginatedResponse<User>`.
This is the only way to share a query across the RSC/client boundary in Next:
`next/headers` is server-only, so it can't live inside the client query fetcher.

`makeQueryClient()` (`@/services/core/query-client`) is the shared config —
`staleTime: 60_000` keeps prefetched data fresh through hydration. The browser
reuses one client (`app/providers.tsx`); the server makes one per request
(`getServerQueryClient`, deduped by React `cache`).

Pure read pages use this prefetch+hydrate pattern. The `/auth-demo` route instead
resolves its data in the RSC and passes it as props (then `router.refresh()` after
a mutation) — both are valid; reach for hydrate when the client query needs to own
refetch/invalidation, props when the RSC fully renders the data.

## i18n State — react-i18next

`initI18n()` sets up i18next with en/ja locales. The active locale is persisted
to `STORAGE_KEYS.LANGUAGE` in localStorage (SSR-guarded; no-op on server).
Switching locale:

```ts
import { setLocale } from "@/i18n/i18n";
setLocale("ja"); // changes language + persists to localStorage (client only)
```

## Auth State — Derived from Session Query

Auth state is not a separate store. The `useAuth()` hook (in `src/services/auth/session.ts`)
derives from the client's `useMeQuery()`:

```ts
const { user, isAuthenticated, isLoading } = useAuth();
```

For server components, call `getMeServerData()` directly from `@/server/get-me`.
