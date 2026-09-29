# Bootstrap Flow

## App Router Entry

```
Next.js build
  └── src/app/layout.tsx         (RSC — server component, suppressHydrationWarning)
        └── <Providers>          ("use client" boundary)
              ├── initI18n()     (i18next setup, SSR-safe)
              ├── initServices() (called in useEffect — browser only)
              │     ├── Api.setBaseURL(getApiBaseUrl(), "MAIN")  // NEXT_PUBLIC_APP_ENDPOINT + /api/v1
              │     └── Api.registerInterceptors(new ApiInterceptors({
              │           MAIN: { endpoint: "/auth/refresh", skipPaths: [login, register, logout],
              │                   hasSession: hasSessionHint }
              │         }))
              ├── QueryClientProvider
              └── I18nextProvider
                    ├── <SiteHeader>     (nav, active link, locale toggle, logout)
                    └── <main>
                          ├── <SessionAlert>  (banner on a transient session failure)
                          └── {children}      (page components)
```

## Key Points

- `layout.tsx` is a React Server Component with `suppressHydrationWarning` on `<html>` and `<body>`.
- `Providers` is the `"use client"` boundary — everything below it is hydrated.
- `initServices()` runs once at module load in the browser (before any query),
  never during SSR. The session subscriptions (cache reset, expiry redirect,
  cross-tab sync) are `useEffect`s with cleanup in `Providers`. Auth cookies are managed by the backend; the client never reads them.
- `layout.tsx` reads the language cookie on the server and passes it to
  `<Providers initialLanguage>` so SSR and the first client render use the same
  locale (no flash). `initI18n()` falls back to the cookie via `document.cookie`,
  then `NEXT_PUBLIC_LANGUAGE_CODE`, then `en`.
- The `QueryClient` is created once per browser session via `getQueryClient()`;
  on the server a fresh client is created per request to avoid state leakage.
- Auth state (`useAuth()`) is derived from the client's session query; server components
  call `readServerSession()` (`src/server/session.ts`) to resolve the session
  server-side with forwarded cookies.

## Route Rendering

| Route      | Render mode    | Notes                         |
| ---------- | -------------- | ----------------------------- |
| `/`        | `"use client"` | i18n hooks + dialog demo      |
| `/counter` | `"use client"` | Needs Zustand + i18n          |
| `/login`   | `"use client"` | react-hook-form + zod         |
| `/users`   | RSC + client island | Server prefetch + hydrate, `proxy.ts` guard |
| `/form`    | `"use client"` | react-hook-form + i18n        |
| any other URL | `not-found.tsx` | Localized 404 inside the root layout |

Most pages are client components because react-i18next hooks require the client.
`/users` is the SSR-first example (see [state-management.md](./state-management.md)).
