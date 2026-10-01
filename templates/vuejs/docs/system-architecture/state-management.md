# State Management

Two complementary stores. **TanStack Vue Query** owns server state (fetching,
caching, invalidation). **Pinia** owns client/session state (UI flags, the live
socket, locale persistence). Pick the one that matches the data's source of truth.

## Server State — TanStack Vue Query

A single `QueryClient` is created in `plugins/vue-query.ts` and installed app-wide:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    },
  },
});
```

`retry: false` is intentional — the response interceptor already handles 401
recovery, so blind retries would only mask real errors.

### `defineQuery` (`services/core/tanstack.ts`)

Builds a reusable, typed query with a stable key builder:

```ts
export const useUsersListQuery = defineQuery<PaginatedResponse<User>>({
  key: "users.list",
  fetcher: () => UsersModel.list(),
});

// in a component:
const { data, isLoading, error } = useUsersListQuery(); // data.value?.data is User[]
```

- Key shape is `[key]` or `[key, params]`. The key is **reactive** — built from a
  `computed` over `toValue(params)`, so changing `params` (a ref/getter)
  refetches automatically.
- The definition exposes `.key` and `.queryKey(params)` so other code (mutations,
  manual invalidation) can target the exact cache entry.

### `defineMutation`

```ts
export const useLoginMutation = defineMutation<AuthResult, LoginPayload>({
  key: "auth.login",
  mutator: (payload) => AuthModel.login(payload),
});
```

- `mutator` performs the write; `mutationKey` is `[key]`.
- Optional `invalidates: (string | QueryKey)[]` — a string is a key prefix, an
  array targets exactly that key. The wrapper invalidates each entry through the
  mutation's `QueryClient` (`tanstack-mutation.ts`) and awaits it before the
  success callbacks:

```ts
await Promise.all(
  (config.invalidates ?? []).map((key) =>
    client.invalidateQueries({ queryKey: typeof key === "string" ? [key] : key }),
  ),
);
// then the definition-level hook, then the per-call hook
```

So a mutation that edits a user can declare `invalidates: ["users.list"]` and the
list refetches automatically.

### Key Conventions

Keys are dotted namespaces matching the domain: `auth.login`, `auth.register`,
`auth.logout`, `auth.me`, `users.list`. Reuse the same string in both the query's
`key` and any mutation's `invalidates` so cache targeting stays consistent.

## Client State — Pinia

A single `createPinia()` (`plugins/pinia.ts`) backs all stores. Stores use the
setup syntax and are imported **explicitly** (never auto-imported) per project
convention: `import { useSocketIOStore } from "@/stores/socket-io"`.

### Session Store (`stores/auth.ts`)

`useAuthStore` holds the signed-in `user`, `isAuthenticated`, `hydrate()` /
`retryHydrate()` and `hydrateError`; see [Security & Auth](./security-auth.md).

### Example — Socket Store (`stores/socket-io.ts`)

```ts
export const useSocketIOStore = defineStore("socket-io", () => {
  const ioStore = ref<IoStoreState>({ socket: null, authenticated: false });
  function setSocketIO(data: Partial<IoStoreState>) {
    ioStore.value = { ...ioStore.value, ...data };
  }
  return { ioStore, setSocketIO };
});
```

It holds the shared live `Socket` instance plus an `authenticated` flag, so the
whole app reuses one connection (see
[Networking & Realtime](./networking-realtime.md)).

## Choosing the Right Store

| Data | Use |
| --- | --- |
| Anything fetched from a backend | TanStack Vue Query (`defineQuery`/`defineMutation`) |
| The live socket, auth/session UI flags, transient UI state | Pinia store |
| Locale / theme / auth-token persistence | localStorage via `STORAGE_KEYS` |
