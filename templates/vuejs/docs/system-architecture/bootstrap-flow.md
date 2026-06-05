# Bootstrap Flow

How the app comes alive, from `src/main.ts` to a mounted Vue tree. Two distinct
phases run in order: **service wiring** (interceptor-aware HTTP layer) then
**plugin registration** (i18n, pinia, router, vue-query, directives).

## Entry Point — `src/main.ts`

```ts
import { registerPlugins } from "@/plugins";
import { initServices } from "@/services";
import { createApp } from "vue";
import App from "./App.vue";
import "@/scss/tailwind.css";
import "@/scss/main.scss";

initServices();              // 1. wire the HTTP layer BEFORE any component renders

const app = createApp(App);
registerPlugins(app);        // 2. install plugins onto the app
app.mount("#app");           // 3. mount
```

Order matters: `initServices()` runs first so the shared `Api` client knows every
backend's base URL and has its interceptors registered before any view (or query)
fires a request.

## Phase 1 — `initServices()` (`src/services/init-services.ts`)

Declares every backend in one `SERVICES` table. For each entry with a non-empty
base URL it: sets the base URL, registers the localStorage token slot, and (if a
`refresh` block is present) opts that service into auto-refresh.

```ts
const SERVICES = [
  {
    name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    tokenKey: STORAGE_KEYS.AUTH_TOKEN,
    refresh: { endpoint: "/auth/refresh" },
  },
];

export function initServices(): void {
  const refreshByService: Record<string, ServiceRefreshConfig> = {};
  for (const svc of SERVICES) {
    if (!svc.baseURL) continue;                       // empty URL = dormant service
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
    if (svc.refresh) refreshByService[svc.name] = svc.refresh;
  }
  Api.registerInterceptors(new ApiInterceptors(refreshByService));
}
```

Adding a backend = one row + its `VITE_*_API_URL` env var. See
[Networking & Realtime](./networking-realtime.md) and
[Security & Auth](./security-auth.md) for what the interceptors then do.

Domain models (`AuthModel`, `UsersModel`) self-register via a static
initializer block calling `Model.setup({ path, service })`, so they bind to the
base URL `initServices()` just set.

## Phase 2 — `registerPlugins(app)` (`src/plugins/index.ts`)

```ts
export function registerPlugins(app: App) {
  installI18n(app);       // vue-i18n: locale from localStorage → VITE_LANGUAGE_CODE → "en"
  app.use(pinia);         // createPinia()
  app.use(router);        // vue-router, createWebHistory, lazy route components
  setupVueQuery(app);     // TanStack Vue Query plugin + shared QueryClient
  registerDirectives(app);// custom directives, e.g. v-track
}
```

| Plugin | File | What it sets up |
| --- | --- | --- |
| i18n | `plugins/i18n.ts` | `createI18n` (Composition mode, `legacy: false`), `en`/`ja` messages, fallback `en`. Locale persisted to `STORAGE_KEYS.LANGUAGE` via `setLocale`. |
| pinia | `plugins/pinia.ts` | A single `createPinia()` instance for all stores. |
| router | `router/index.ts` | `createWebHistory` SPA routing; home/counter/users/form routes are lazy `import()`s. |
| vue-query | `plugins/vue-query.ts` | One `QueryClient` (`retry: false`, `refetchOnWindowFocus: true`, `keepPreviousData`); exported for direct use. |
| directives | `plugins/directives.ts` | Registers app-wide directives (`v-track` from `@/directives`). |

## Mount

`app.mount("#app")` renders `App.vue` into `index.html`'s `#app` node. By this
point the HTTP layer is fully configured and every plugin is installed, so the
first route component can immediately issue authenticated, signed requests.

## Sequence

```
main.ts
  ├─ initServices()                    # base URLs + token slots + interceptors
  │     └─ Api.registerInterceptors(new ApiInterceptors(refreshByService))
  ├─ createApp(App)
  ├─ registerPlugins(app)
  │     ├─ installI18n      ├─ pinia   ├─ router
  │     ├─ setupVueQuery    └─ registerDirectives
  └─ app.mount("#app")
```
