# Bootstrap Flow

How the app comes alive in a Nuxt SSR runtime. There is no hand-written
`main.ts` — Nuxt owns the entry point. Boot is driven by **numbered plugins**
under `app/plugins/`, which Nuxt discovers and runs in filename order, on the
server first (during Nitro render) and again on the client (during hydration).

## Plugin Order

Nuxt runs `app/plugins/*` alphabetically; the numeric prefixes pin the order:

| Plugin | Runs where | What it sets up |
| --- | --- | --- |
| `01.init-services.ts` | **server + client** | Base URLs + token slots + interceptors for the shared `Api` client |
| `02.vue-query.ts` | server + client | One `QueryClient`, installs `VueQueryPlugin` on `nuxtApp.vueApp` |
| `03.directives.ts` | server + client | Registers app-wide directives (`v-track`) |

`01` must precede everything because the HTTP layer (base URLs + interceptors)
must exist before any page-level `useQuery` fetches a request during SSR.

> No `.client`/`.server` suffix on `01` is deliberate — it runs on **both**
> sides so SSR and CSR resolve the same backend origins. See
> [SSR & Runtime Config](./ssr-and-runtime-config.md) for why that matters.

## `01.init-services.ts` — the HTTP wiring plugin

It reads `runtimeConfig.public` inside the plugin (a valid Nuxt request scope),
declares every backend in a `services` table, and for each entry with a
non-empty base URL: sets the base URL, registers the localStorage token slot,
and (if a `refresh` block is present) opts that service into auto-refresh.

```ts
export default defineNuxtPlugin(() => {
  const { public: pub } = useRuntimeConfig();

  const services = [
    {
      name: "MAIN",
      baseURL: pub.apiBaseUrl || "https://jsonplaceholder.typicode.com",
      tokenKey: () => useStorageKeys("AUTH_TOKEN"),
      refresh: { endpoint: "/auth/refresh" },
    },
  ];

  const refreshByService: Record<string, ServiceRefreshConfig> = {};
  for (const svc of services) {
    if (!svc.baseURL) continue;                       // empty URL = dormant service
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
});
```

Adding a backend = one row + its `NUXT_PUBLIC_*` env var (see
[SSR & Runtime Config](./ssr-and-runtime-config.md)). The `tokenKey` is a lazy
resolver (a function), not a string, because `useStorageKeys()` itself calls
`useRuntimeConfig()` and must run inside a request scope, not at module load.

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
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
      },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
});
```

A `QueryClient` is created on the server too, so `useQuery` inside
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
  │     ├─ 01.init-services  → Api base URLs + token slots + ApiInterceptors
  │     ├─ 02.vue-query      → QueryClient (so SSR useQuery is safe)
  │     ├─ 03.directives     → v-track
  │     └─ render app.vue → NuxtLayout → NuxtPage  (HTML)
  ▼ ship HTML + payload
Client hydration
  └─ run the SAME plugins again, then attach to server-rendered DOM
```
