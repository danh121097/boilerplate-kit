# SSR and Runtime Config

This template renders on the server and hydrates in the browser. Two consequences
shape the rest of the code: configuration is read from `import.meta.env`, and every
browser-only API needs a guard.

## Configuration

Values come from `VITE_*` variables read through `import.meta.env`. They are inlined
at build time, so the server bundle and the browser bundle see the same values, and
changing one means rebuilding.

| Variable | Used for |
|---|---|
| `VITE_APP_NAME` | Prefix of cookie and localStorage keys (`STORAGE_KEYS`) |
| `VITE_APP_ENDPOINT` | Backend origin (REST base = origin + prefix; Socket.IO uses it bare) |
| `VITE_API_PREFIX` | REST prefix, default `/api/v1` |
| `VITE_LANGUAGE_CODE` | Default locale when there is no LANGUAGE cookie |
| `VITE_HMAC_SECRET` | HMAC signing secret; required by the bundled backends and must equal the backend `HMAC_SECRET` |
| `VITE_BUILD_VERSION` | Value of the `x-version` header |
| `VITE_AUTH_MOCK*` | Dev-only mock auth; ignored in production builds |

## Browser-only APIs

- `localStorage`, `document` and `window` are guarded with `typeof window !== "undefined"`
  (or `typeof document`); on the server they return `null` or do nothing.
- Preferences the server must know live in cookies: the locale (`LANGUAGE`) and the
  readable session hint (`SESSION`). `createIsomorphicFn` reads them from the request
  on the server and from `document.cookie` in the browser.
- Route guards (`requireSession`, `redirectIfSignedIn`) run in `beforeLoad` on both
  sides and decide from the session hint cookie, so a protected page never flashes.
- `socket.io-client` is imported lazily inside an effect, keeping it out of the SSR bundle.

## Server functions

`createServerFn` handlers in `src/server/` run only on the server (the client calls
them over RPC) and fetch the backend directly, without the axios client layer. When
the access cookie is missing they return `ServerUnauthorized`, and the query fetcher
refreshes in the browser and replays the call. See
[security-auth](./security-auth.md) and [state-management](./state-management.md).

## Hydration

Route loaders prefetch queries into the per-request QueryClient; the SSR-query
integration dehydrates it into the HTML and the browser reuses it without a refetch.
The `<html>` and `<body>` tags carry `suppressHydrationWarning` only to tolerate
browser extensions that rewrite attributes before React hydrates.
