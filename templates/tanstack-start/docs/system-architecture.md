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
| Entry | `src/main.tsx` | Virtual modules (#tanstack-router-entry, #tanstack-start-entry) |
| Config | `vite.config.ts` | `vite.config.ts` (with `@tanstack/react-start` Vite plugin) |
| Router factory | N/A | `getRouter()` in `src/router.tsx` |
| Server functions | None | `createServerFn` in `src/server/` |
| Service layer scope | Client-only | Client-only (SSR-guarded) |
| localStorage guards | Not required | Required (`typeof window`) |

## SSR + TanStack Start Vite Plugin

TanStack Start v1.168+ uses a Vite plugin that generates virtual entry modules
on every build/dev run. There are no explicit `client.tsx` or `ssr.tsx` files.
Instead:

- `src/router.tsx` exports `getRouter()` — a factory called once per SSR request
  and once on the client (cached thereafter)
- The Vite plugin wires this factory into virtual modules that handle browser
  hydration and server rendering automatically
- `src/routes/__root.tsx` renders the full HTML document (`<html>`, `<head>`,
  `<body>`, `<HeadContent />`, `<Scripts />`)

## getRouter Factory + QueryClient Lifecycle

```
getRouter() is called:
  1. Per SSR request (server-side) → fresh QueryClient per request
  2. Once on client (cached by the virtual entry) → singleton QueryClient

Per call:
  • Create fresh QueryClient with staleTime: 60_000
  • Create fresh i18n instance (reads localStorage if window is defined)
  • Create router with context: { queryClient }
  • Call setupRouterSsrQueryIntegration({ router, queryClient })
    → dehydrates on server, hydrates on client, wraps in QueryClientProvider
  • Return router

On server: router renders → HTML includes dehydrated QueryClient state
On client: hydrated state is restored → route components read cache without
  duplicate fetches
```

## Route Loader + Server Function Pattern

```
Browser request → SSR render
  → route loader (runs on server)
      → queryClient.ensureQueryData(useUsersList.queryOptions())
          → getUsersServerFn() (server-only handler, direct fetch)
  → React renders with pre-populated cache
  → HTML includes dehydrated QueryClient state
  → HTML streamed to browser

Client hydration
  → dehydrated cache restored into QueryClient
  → route components useQuery() reads hydrated cache synchronously
  → NO duplicate fetch (data already available locally)

Client navigation
  → route loader (runs on client)
      → queryClient.ensureQueryData
          → getRpcUrl() + HTTP fetch to server fn endpoint (automatic)
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
