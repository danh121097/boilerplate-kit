# Bootstrap Flow

How the app comes alive in a Nuxt SSR runtime. There is no hand-written
`main.ts` — Nuxt owns the entry point. Boot is driven by **numbered plugins**
under `app/plugins/`, which Nuxt discovers and runs in filename order, on the
server first (during Nitro render) and again on the client (during hydration).

## Plugin Order

Nuxt runs `app/plugins/*` alphabetically; the numeric prefixes pin the order:

| Plugin | Runs where | What it sets up |
| --- | --- | --- |
| `01.init-services.ts` | **server + client** | App prefix, mock auth init, base URLs + interceptors for the shared `Api` client, the session refresher |
| `02.vue-query.ts` | server + client | One `QueryClient`, installs `VueQueryPlugin`, dehydrates / hydrates the SSR query state, provides `$queryClient` |
| `03.directives.ts` | server + client | Registers app-wide directives (`v-track`) |
| `04.session-expiry.client.ts` | client | Resets the query cache when a session ends and redirects to `/login?redirect=…` on `"expired"` |
| `05.session-sync.client.ts` | client | Follows login / logout across tabs (`syncAuthAcrossTabs`) |

`01` must precede everything because the HTTP layer (base URLs + interceptors)
must exist before any page-level `useQuery` fetches a request during SSR.

> No `.client`/`.server` suffix on `01` is deliberate — it runs on **both**
> sides so SSR and CSR resolve the same backend origins. See
> [SSR & Runtime Config](./ssr-and-runtime-config.md) for why that matters.

## `01.init-services.ts` — the HTTP wiring plugin

It reads `runtimeConfig.public` inside the plugin (a valid Nuxt request scope),
sets the app-name prefix (`setAppPrefix`) and initializes mock auth, declares
every backend in a `services` table, and for each entry with a non-empty base
URL sets the base URL and (if a `refresh` block is present) opts that service
into auto-refresh. The cookies are httpOnly, so there is no token slot.

```ts
export default defineNuxtPlugin(() => {
  setAppPrefix(useRuntimeConfig().public.appName);
  initMockAuth(useRuntimeConfig().public);

  const services = [
    {
      name: "MAIN",
      baseURL: getApiBaseUrl(), // appEndpoint + /api/v1
      refresh: {
        onRefreshed: markSessionActive,
        endpoint: authContract.paths.refresh,
        skipPaths: [authContract.paths.login, authContract.paths.register, authContract.paths.logout],
      },
    },
  ];

  const refreshByService: Record<string, ServiceRefreshConfig> = {};
  for (const svc of services) {
    if (!svc.baseURL) continue;                       // empty URL = dormant service
    Api.setBaseURL(svc.baseURL, svc.name);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }
  const interceptors = new ApiInterceptors(refreshByService);
  Api.registerInterceptors(interceptors);
  registerSessionRefresher((service, sentAt) => interceptors.refreshSession(service, sentAt));
});
```

Adding a backend = one row + its `NUXT_PUBLIC_*` env var (see
[SSR & Runtime Config](./ssr-and-runtime-config.md)). `registerSessionRefresher`
lets non-HTTP callers (the Socket.IO retry) run the same single-flight refresh.

Domain models (`AuthModel`, `UsersModel`) self-register via a static
initializer block calling `Model.setup({ path })`, binding to the base URL this
plugin set. See [Networking & Realtime](./networking-realtime.md).

## `02.vue-query.ts` — universal query client

```ts
export default defineNuxtPlugin((nuxtApp) => {
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
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });

  const vueQueryState = useState<DehydratedState | null>("vue-query");
  if (import.meta.server) {
    nuxtApp.hooks.hook("app:rendered", () => {
      vueQueryState.value = dehydrate(queryClient, { shouldDehydrateQuery });
    });
  }
  if (import.meta.client && vueQueryState.value) hydrate(queryClient, vueQueryState.value);

  return { provide: { queryClient } };
});
```

The server dehydrates the client into the Nuxt payload after render and the
browser hydrates from it, so a query resolved during SSR is not refetched
(`shouldDehydrateQuery` leaves out a 401, which the browser reruns). A `QueryClient` is created on the server too, so `useQuery` inside
`<script setup>` does not throw during SSR. `retry: false` is intentional — the
response interceptor already handles 401 recovery (see
[Error Handling](./error-handling.md)).

## Mount & Render

`app/app.vue` is the root component; it renders the active layout and page:

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

Nuxt renders this tree to HTML on the server (Nitro), ships it, then hydrates on
the client where the same numbered plugins run again. By hydration the HTTP
layer is configured, so the first interactive request is authenticated + signed.

## Sequence

```
Nitro SSR request
  ├─ run plugins (server)
  │     ├─ 01.init-services  → app prefix + Api base URLs + ApiInterceptors
  │     ├─ 02.vue-query      → QueryClient (so SSR useQuery is safe) + dehydrate
  │     ├─ 03.directives     → v-track
  │     └─ render app.vue → NuxtLayout → NuxtPage  (HTML)
  ▼ ship HTML + payload
Client hydration
  └─ run the same plugins again (plus 04 / 05, client only), hydrate the
     query state, then attach to server-rendered DOM
```
