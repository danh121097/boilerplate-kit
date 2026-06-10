# State Management

## Server state — TanStack React Query

Remote data lives in the QueryClient cache. Queries are declared once with the
`defineQuery` helper (`@/services/core`), which returns a hook plus `.queryKey()`
and `.queryOptions()` accessors so the same definition drives both a component and
a route loader:

```ts
const { data, isLoading, error } = useUsersList();
```

### SSR Data Prefetch + Hydration Flow

A fresh QueryClient is created in `src/router.tsx` (getRouter factory) with
default options:
- `retry: false`
- `refetchOnWindowFocus: true`
- `placeholderData: keepPreviousData`
- **`staleTime: 60_000`** — hydrated SSR data remains fresh past first paint,
  preventing a wasteful refetch on mount
- **`defaultPreloadStaleTime: 0`** — intent-preloads are always fresh

Route loaders prefetch via `queryClient.ensureQueryData()`, passing the
definition's `.queryOptions()` so loader and component share one key + fetcher:

```ts
// src/routes/users.tsx
const useUsersList = defineQuery<User[]>({
  key: "users.list",
  fetcher: () => getUsersServerFn(),
});

export const Route = createFileRoute("/users")({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(useUsersList.queryOptions()),
  component: UsersPage,
});
```

The router's `setupRouterSsrQueryIntegration` (from `@tanstack/react-router-ssr-query`)
automatically:
- Dehydrates the QueryClient on the server and serializes it into HTML
- Hydrates that cache on the client before mounting React
- Wraps the router tree in `QueryClientProvider` (no manual provider needed)
- Streams resolving queries during SSR

**Key invariant**: one `defineQuery` definition (one key, one fetcher) feeds both
the loader (`.queryOptions()`) and the component (the hook). Two fetchers on one
key would make the prefetched cache shape and the rendered data disagree.

**Key registry**: every query/mutation key lives in `src/services/query-keys.ts`
(`queryKeys.users.*`, `queryKeys.auth.*`) — reference it instead of inline strings
so keys stay unique and greppable. A unit test asserts the registry has no duplicates.

**Multi-source caveat**: the SSR server-fn list (`useUsersList`, `queryKeys.users.list`,
in `routes/users.tsx`) and the auth-aware client list (`useUsersListQuery`,
`queryKeys.users.listClient`, in `@/services`) are deliberately under DISTINCT keys so
the two fetchers never collide. Keep server-fn and client-service queries on separate keys.

## Client state — Zustand

Local UI state lives in Zustand stores under `src/stores/`.

```ts
// src/stores/counter.ts
export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  decrement: () => set((state) => ({ count: state.count - 1 })),
  reset: () => set({ count: 0 }),
}));
```

Stores are imported explicitly — no auto-import or global injection.

## Locale state

Locale is tracked by i18next internally. `setLocale()` in `src/i18n/i18n.ts`
calls `i18next.changeLanguage()` and persists to `STORAGE_KEYS.LANGUAGE`.
The `useTranslation()` hook re-renders components reactively on language change.

## Storage keys

`STORAGE_KEYS` in `src/enums/storage-keys.ts` is the single source of truth for
all `localStorage` keys, prefixed with `VITE_APP_NAME` to prevent collisions:

```ts
AUTH_TOKEN: `${APP_PREFIX}_AUTH_TOKEN`
LANGUAGE:   `${APP_PREFIX}_LANGUAGE`
THEME:      `${APP_PREFIX}_THEME`
```
