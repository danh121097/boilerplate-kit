# Bootstrap Flow

## App Router Entry

```
Next.js build
  └── src/app/layout.tsx         (RSC — server component)
        └── <Providers>          ("use client" boundary)
              ├── initI18n()     (i18next setup, SSR-safe)
              ├── initServices() (called in useEffect — browser only)
              │     ├── Api.setBaseURL(NEXT_PUBLIC_API_BASE_URL, "MAIN")
              │     ├── registerServiceToken("MAIN", STORAGE_KEYS.AUTH_TOKEN)
              │     └── Api.registerInterceptors(new ApiInterceptors(...))
              ├── QueryClientProvider
              └── I18nextProvider
                    └── {children}   (page components)
```

## Key Points

- `layout.tsx` is a React Server Component. It never runs in the browser directly.
- `Providers` is the `"use client"` boundary — everything below it is hydrated.
- `initServices()` is called inside `useEffect` so it only runs in the browser,
  never during SSR. This ensures localStorage and window are available.
- `initI18n()` is SSR-guarded: `getSavedLanguage()` returns the env-var default
  when `window` is undefined.
- The `QueryClient` is created once per browser session via `getQueryClient()`;
  on the server a fresh client is created per request to avoid state leakage.

## Route Rendering

| Route | Render mode | Notes |
|-------|-------------|-------|
| `/` | `"use client"` | Needs i18n hooks |
| `/counter` | `"use client"` | Needs Zustand + i18n |
| `/users` | `"use client"` | React Query via service layer |
| `/form` | `"use client"` | react-hook-form + i18n |

All routes are currently client components because react-i18next hooks require
the client. Server-side data prefetch (HydrationBoundary) can be added by
fetching via native `fetch()` in RSC and dehydrating the QueryClient state.
