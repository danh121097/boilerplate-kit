# System Architecture

TanStack Start SSR starter — overview of key architectural decisions.

Detailed sub-topics:

- [Bootstrap & render flow](./system-architecture/bootstrap-flow.md)
- [Networking & service layer](./system-architecture/networking-realtime.md)
- [Security & auth](./system-architecture/security-auth.md)
- [State management](./system-architecture/state-management.md)
- [Build pipeline](./system-architecture/build-pipeline.md)
- [Error handling](./system-architecture/error-handling.md)

## TanStack Start vs reactjs Template

| Concern | reactjs (SPA) | tanstack-start (SSR) |
|---|---|---|
| Rendering | Client-only | SSR + hydration |
| Entry | `src/main.tsx` | `src/client.tsx` + `src/ssr.tsx` |
| Config | `vite.config.ts` | `app.config.ts` (Vinxi) |
| Server functions | None | `createServerFn` in `src/server/` |
| Service layer scope | Client-only | Client-only (SSR-guarded) |
| localStorage guards | Not required | Required (`typeof window`) |

## SSR Entry Points

```
src/client.tsx   — browser hydration (runs once per page load)
  initServices() → wires axios base URLs + interceptors
  initI18n()     → reads localStorage locale
  hydrateRoot()  → mounts React + providers

src/ssr.tsx      — server render handler (runs per request)
  createAppRouter() → fresh QueryClient + router per request
  initI18n()        → reads env var fallback (no localStorage)
  InnerWrap         → QueryClientProvider + I18nextProvider
```

## Route Loader + Server Function Pattern

```
Browser request → SSR render
  → route loader (runs on server)
      → queryClient.ensureQueryData({ queryFn: getUsersServerFn })
          → createServerFn handler (server-only, direct fetch)
  → React renders with pre-populated cache
  → HTML streamed to browser

Client navigation
  → route loader (runs on client)
      → queryClient.ensureQueryData
          → RPCs to server fn endpoint (automatic)
  → React re-renders with fresh data
```

## Service Layer Scope

The axios service layer (`src/services/`) is **client-only**:

- `initServices()` is called only in `src/client.tsx` (browser entry).
- All `localStorage` access is guarded: `if (typeof window === "undefined") return null`.
- Server functions in `src/server/` use `fetch` directly — no axios, no token registry.
- The `reloadPage()` helper in interceptors is guarded: `if (typeof window !== "undefined")`.

## QueryClient Per Request

To prevent cross-request data leaks:

- `src/ssr.tsx` calls `createAppRouter()` which creates a **fresh** `QueryClient` per request.
- `src/client.tsx` uses the singleton `queryClient` exported from `src/router.tsx`.
- Route loaders receive `queryClient` via router context — no global import needed.

## Environment Variables

All env vars use the `VITE_` prefix (TanStack Start uses Vite internally):

```
VITE_API_BASE_URL    — backend base URL
VITE_APP_NAME        — localStorage key prefix
VITE_LANGUAGE_CODE   — default locale
VITE_HMAC_SECRET     — HMAC signing secret (client-readable, soft layer)
VITE_BUILD_VERSION   — injected by CI for x-version header
```

Server functions can also read `process.env.*` for server-only secrets that
should never be exposed to the browser.
