# SSR & Runtime Config

The defining delta from the Vue SPA template: this app **renders on the server**
(Nitro) and rehydrates on the client. Two consequences shape every other
subsystem — configuration moves from build-time `import.meta.env` to runtime
`runtimeConfig`, and any browser-only API must be guarded.

## `runtimeConfig` replaces `import.meta.env`

The Vue template read `import.meta.env.VITE_*` (inlined at build time). Nuxt uses
`runtimeConfig`, declared in `nuxt.config.ts` and resolvable at runtime via
`useRuntimeConfig()`:

```ts
// nuxt.config.ts
runtimeConfig: {
  public: {
    appEndpoint: "",
    apiPrefix: "/api/v1",
    appName: "",
    languageCode: "en",
    hmacSecret: "",
    buildVersion: "1.0.0",
  },
},
```

Keys under `public` are sent to the browser; top-level keys would stay
server-only. Each key is overridable at runtime by a matching env var, camelCase
→ `NUXT_PUBLIC_SCREAMING_SNAKE`:

| Runtime key | Env var override | Used by |
| --- | --- | --- |
| `public.appEndpoint` | `NUXT_PUBLIC_APP_ENDPOINT` | `01.init-services.ts` via getApiBaseUrl() (origin + /api/v1) |
| `public.apiPrefix` | `NUXT_PUBLIC_API_PREFIX` | `api-config.ts` (REST prefix, default `/api/v1`) |
| `public.appName` | `NUXT_PUBLIC_APP_NAME` | `storage-keys.ts` (localStorage prefix) |
| `public.languageCode` | `NUXT_PUBLIC_LANGUAGE_CODE` | locale fallback |
| `public.hmacSecret` | `NUXT_PUBLIC_HMAC_SECRET` | `hmac-signature.ts`, `useSocketIO.ts` |
| `public.buildVersion` | `NUXT_PUBLIC_BUILD_VERSION` | `hmac-signature.ts` (`x-version`) |
| `public.authMock` / `authMockEmail` / `authMockPassword` | `NUXT_PUBLIC_AUTH_MOCK` / `_EMAIL` / `_PASSWORD` | `mock-auth.ts` (dev-only mock auth; ignored in production builds) |

> Because these are runtime overrides, the same built image can be deployed to
> dev/staging/prod with different `NUXT_PUBLIC_*` values — no rebuild.

## `useRuntimeConfig()` must run inside a request scope

`useRuntimeConfig()` is only valid inside a Nuxt request scope (plugin,
composable, `setup`). It must **not** be called at module top-level. Two patterns
in this codebase enforce that with lazy resolution:

`storage-keys.ts` resolves the prefix lazily and caches it:

```ts
export function useStorageKeys(name: keyof StorageKeyMap): string {
  if (!cached) {
    const prefix = useRuntimeConfig().public.appName || "PRISM_APP";
    cached = buildKeys(prefix);
  }
  return cached[name];
}
```

`hmac-signature.ts` reads it lazily, wrapped in `try/catch` so a call outside a
scope degrades to "no signature" rather than throwing:

```ts
try {
  const cfg = useRuntimeConfig() as unknown as {
    public?: { hmacSecret?: string; buildVersion?: string };
  };
  secret = cfg.public?.hmacSecret ?? "";
  xVersion = cfg.public?.buildVersion ?? "1.0.0";
} catch {
  return null;
}
```

This is why `01.init-services.ts` resolves the app prefix once, inside its
plugin scope (`setAppPrefix(useRuntimeConfig().public.appName)`), before any
request runs: the session hint cookie (`<APP_PREFIX>_SESSION`), the auth-sync
key (`<APP_PREFIX>_AUTH_SYNC`), the refresh lock and its localStorage timestamp
are all prefixed with it, on the server too.

## Server vs Client: what runs where

| Concern | Server (Nitro) | Client |
| --- | --- | --- |
| Numbered plugins | yes (render) | yes (hydration) |
| `useRuntimeConfig()` | yes | yes |
| Auth tokens | httpOnly cookies, forwarded from the request (`serverApiGet`) | httpOnly cookies, sent by the browser (`withCredentials`) |
| Session hint `<APP_PREFIX>_SESSION` | read from the request `cookie` header (`hasServerSessionHint`) | read / written via `document.cookie` |
| 401 refresh-and-retry | never (SSR fetches reject; the browser resolves them) | yes (axios interceptors) |
| Socket.IO handshake | never (`onMounted` only) | yes |

The server never refreshes: the refresh cookie is scoped to the backend's auth
routes and only the browser can rotate it. `readServerSession` (see
[Security & Auth](./security-auth.md)) maps the SSR `/auth/me` read as:

| SSR result | Outcome |
| --- | --- |
| user | the user (dehydrated) |
| 401 + no session hint | `null` — anonymous, safe to dehydrate |
| 401 + session hint | rejects — the browser refreshes after hydration |
| 5xx / unreachable | rejects (`retryable: true`) — the browser retries |

## `server/` directory (Nitro)

The template ships an **empty** `server/` directory. Nitro auto-registers
`server/api/**`, `server/routes/**`, and `server/middleware/**` when populated —
the natural place to add a BFF/proxy that signs HMAC requests with a *private*
(non-`public`) `runtimeConfig` secret, keeping it out of the browser. See the
production note in [Security & Auth](./security-auth.md).

## Hydration concerns

- **No SSR/client markup mismatch from auth:** because tokens are null on the
  server, the server renders the logged-out/loading view; the client fills in
  authenticated data after mount. Components should render a loading state
  rather than assuming a token exists.
- **TanStack Query:** a `QueryClient` exists on both sides so `useQuery` in
  `<script setup>` is safe during SSR, but it does not wait: the server renders
  the loading state while the fetch finishes after render and lands in the
  payload, so the client hydrates data the HTML lacks (a hydration mismatch). A
  page that renders a query's data resolves it during SSR with
  `useServerRenderedQuery(useXxxQuery)` (`services/core/tanstack.ts`, used by
  `pages/users.vue`):

  | SSR result | Server renders | Client hydrates |
  | --- | --- | --- |
  | success | the data | the dehydrated data, no refetch |
  | 401 | loading | nothing dehydrated — fetches through the Model (refreshes) |
  | other failure | the error | the dehydrated error, not retried while hydrating |

  The plugin dehydrates with `shouldDehydrateQuery` (successes + non-401
  errors). A later mount of the same query (client navigation) retries as usual.
- **Socket.IO:** the `io()` constructor is lazy and safe server-side; the actual
  handshake fires in `onMounted`, which only runs on the client.
