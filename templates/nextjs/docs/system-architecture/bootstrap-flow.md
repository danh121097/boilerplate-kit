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
                    └── {children}   (page components)
```

## Key Points

- `layout.tsx` is a React Server Component with `suppressHydrationWarning` on `<html>` and `<body>`.
- `Providers` is the `"use client"` boundary — everything below it is hydrated.
- `initServices()` runs once at module load in the browser (before any query),
  never during SSR. The session subscriptions (cache reset, expiry redirect,
  cross-tab sync) are `useEffect`s with cleanup in `Providers`. Auth cookies are managed by the backend; the client never reads them.
- `initI18n()` is SSR-guarded: `getSavedLanguage()` returns the env-var default
  when `window` is undefined.
- The `QueryClient` is created once per browser session via `getQueryClient()`;
  on the server a fresh client is created per request to avoid state leakage.
- Auth state (`useAuth()`) is derived from the client's session query; server components
  call `readServerSession()` (`src/server/session.ts`) to resolve the session
  server-side with forwarded cookies.

## Route Rendering

| Route      | Render mode    | Notes                         |
| ---------- | -------------- | ----------------------------- |
| `/`        | `"use client"` | Needs i18n hooks              |
| `/counter` | `"use client"` | Needs Zustand + i18n          |
| `/users`   | `"use client"` | React Query via service layer |
| `/form`    | `"use client"` | react-hook-form + i18n        |

All routes are currently client components because react-i18next hooks require
the client. Server-side data prefetch (HydrationBoundary) can be added by
fetching via native `fetch()` in RSC and dehydrating the QueryClient state.
