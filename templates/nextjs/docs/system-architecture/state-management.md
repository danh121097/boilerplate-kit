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
  fetcher: () => UsersModel.list(),
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

export default function UsersPage() {
  return (
    // HydratedQueries prefetches on the server (per-request QueryClient) and
    // wraps children in <HydrationBoundary>.
    <HydratedQueries prefetch={[{ queryKey: [queryKeys.users.list], queryFn: getUsersServerData }]}>
      <UsersListClient /> {/* "use client": reads useUsersListQuery */}
    </HydratedQueries>
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

Read pages use this prefetch+hydrate pattern. An RSC that fully renders its data
could pass it as props instead (then `router.refresh()` after a mutation); reach
for hydrate when the client query needs to own refetch/invalidation.

`defineQuery` also exposes `queryOptions(params?)` (`{ queryKey, queryFn }`) for code
that needs the plain query object; here the server prefetch keeps its own fetcher
(`next/headers`) on the same key.

## i18n State — react-i18next

`initI18n()` sets up i18next with en/ja locales. The active locale is persisted
to the `STORAGE_KEYS.LANGUAGE` cookie so the server can read it on the next
request (`app/layout.tsx` seeds `<html lang>` and the i18n instance from it);
resolution order: cookie, then `NEXT_PUBLIC_LANGUAGE_CODE`, then `en`. Switching
locale:

```ts
import { setLocale } from "@/i18n/i18n";
setLocale("ja"); // changes language + writes the LANGUAGE cookie (client only)
```

## Auth State — Derived from Session Query

Auth state is not a separate store. The `useAuth()` hook (in `src/services/auth/session.ts`)
derives from the client's `useMeQuery()`:

```ts
const { user, isAuthenticated, isLoading, sessionUnavailable, retrySession } = useAuth();
```

There is no client auth store: the cookie-based session lives in the session query.
`sessionUnavailable` is true when the restore failed for a transient reason
(network, timeout, 5xx) and drives the banner — see
[error-handling.md](./error-handling.md#session-unavailable). A 401 resolves to
`null` (signed out) and never sets it.

For server components, call `readServerSession()` directly from `@/server/session`.
