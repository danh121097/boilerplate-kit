# State Management

Two complementary stores. **TanStack Vue Query** owns server state (fetching,
caching, invalidation). **Pinia** owns client/session state (UI flags, the live
socket, locale persistence). Pick the one that matches the data's source of truth.

## Server State — TanStack Vue Query

A single `QueryClient` is created in `plugins/vue-query.ts` and installed app-wide:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: true, placeholderData: keepPreviousData },
  },
});
```

`retry: false` is intentional — the response interceptor already handles 401
recovery, so blind retries would only mask real errors.

### `defineQuery` (`services/core/tanstack.ts`)

Builds a reusable, typed query with a stable key builder:

```ts
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: async () => (await UsersModel.list()).data,
});

// in a component:
const { data, isLoading, error } = useUsersListQuery();
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
- Optional `invalidates: string[]` — on success the wrapper invalidates each
  listed key via the shared `queryClient`:

```ts
onSuccess: async (...args) => {
  if (queryClient && config.invalidates) {
    await Promise.all(config.invalidates.map(
      (k) => queryClient.invalidateQueries({ queryKey: [k] }),
    ));
  }
  await options?.onSuccess?.(...args);     // definition-level hook
  await overrides.onSuccess?.(...args);    // per-call hook
};
```

So a mutation that edits a user can declare `invalidates: ["users.list"]` and the
list refetches automatically. `useQueryClient()` is only pulled in when there is
something to invalidate.

### Key Conventions

Keys are dotted namespaces matching the domain: `auth.login`, `auth.register`,
`auth.logout`, `auth.me`, `users.list`. Reuse the same string in both the query's
`key` and any mutation's `invalidates` so cache targeting stays consistent.

## Client State — Pinia

A single `createPinia()` (`plugins/pinia.ts`) backs all stores. Stores use the
setup syntax and are imported **explicitly** (never auto-imported) per project
convention: `import { useSocketIOStore } from "@/stores/socket-io"`.

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
| Locale / theme / auth-token persistence | localStorage via `STORAGE_KEYS` helpers |
