# State Management

Two complementary stores. **TanStack Vue Query** owns server state (fetching,
caching, invalidation). **Pinia** (via `@pinia/nuxt`) owns client/session state
(UI flags, the live socket). Pick the one matching the data's source of truth.

## Server State — TanStack Vue Query

A single `QueryClient` is created in `app/plugins/02.vue-query.ts` and installed
on `nuxtApp.vueApp` — on both server and client:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      placeholderData: keepPreviousData,
    },
  },
});
nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
```

`retry: false` is intentional — the response interceptor already handles 401
recovery, so blind retries would mask real errors. A client exists during SSR so
`useQuery` in `<script setup>` does not throw; the same query key refetches on
the client after hydration (see
[SSR & Runtime Config](./ssr-and-runtime-config.md)).

### `defineQuery` (`app/services/core/tanstack.ts`)

Builds a reusable, typed query with a stable key builder:

```ts
export const useUsersListQuery = defineQuery<User[]>({
  key: "users.list",
  fetcher: () => UsersModel.list().then((r) => r.data),
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
  listed key via the shared `queryClient`, then runs definition- and per-call
  `onSuccess`:

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

`useQueryClient()` is only pulled in when there is something to invalidate.

### Key Conventions

Dotted namespaces matching the domain: `auth.login`, `auth.register`,
`auth.logout`, `auth.me`, `users.list`. Reuse the same string in a query's `key`
and any mutation's `invalidates` so cache targeting stays consistent.

## Client State — Pinia (`@pinia/nuxt`)

Pinia is installed as a Nuxt module (`modules: [..., "@pinia/nuxt", ...]`). Per
project convention, store **auto-import is disabled** (`pinia: { storesDirs: [] }`
in `nuxt.config.ts`) — stores are imported **explicitly**:
`import { useSocketIOStore } from "@/stores/socket-io"`.

### Example — Socket Store (`app/stores/socket-io.ts`)

```ts
export const useSocketIOStore = defineStore("socket-io", () => {
  const ioStore = ref<IoStoreState>({ socket: null, authenticated: false });
  function setSocketIO(data: Partial<IoStoreState>) {
    ioStore.value = { ...ioStore.value, ...data };
  }
  return { ioStore, setSocketIO };
});
```

It holds the shared live `Socket` plus an `authenticated` flag, so the whole app
reuses one connection (see [Networking & Realtime](./networking-realtime.md)).
The `counter` store (`app/stores/counter.ts`) is a minimal demo of the setup
syntax. `defineStore` / `ref` are Nuxt auto-imports.

## Choosing the Right Store

| Data | Use |
| --- | --- |
| Anything fetched from a backend | TanStack Vue Query (`defineQuery`/`defineMutation`) |
| The live socket, auth/session UI flags, transient UI state | Pinia store |
| Auth-token / locale / theme persistence | localStorage via `useStorageKeys` (client-only) |
