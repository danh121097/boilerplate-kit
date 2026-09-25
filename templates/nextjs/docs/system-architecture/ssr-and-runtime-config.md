# SSR and Runtime Config

## The SSR Boundary Problem

Next.js App Router renders server components on the server where `window`,
`localStorage`, and `document` do not exist. The axios service layer only
runs in the browser; server components use auth cookies directly via
`serverApiGet()` from `next/headers`.

## Browser-Only APIs

Session code that touches the browser is guarded: the session hint and
cross-tab sync no-op without `document` / `window`, and the refresh lock falls
back to per-tab single-flight without `navigator.locks`. A 401 never reloads the
page — a refused refresh ends the session and routes to `/login` client-side.
During SSR, server components never hit this code path.

## SSR Cookie Access

Server Components import cookies from `next/headers`:

```ts
import { cookies } from "next/headers";

const store = await cookies();
const access = store.get("accessToken")?.value;
```

The `serverApiGet<T>()` helper in `src/server/server-api.ts` wraps this,
forwarding only the access cookie (plus HMAC headers) to the backend. It never
refreshes: an RSC cannot set cookies, so a server-side refresh would rotate the
token without delivering it to the browser. An expired or missing access cookie
throws `ServerAuthError` instead (see [security-auth.md](./security-auth.md#ssr-data-fetching)).

## Environment Variables

All client-visible configuration uses `NEXT_PUBLIC_*` prefix so Next.js inlines
the values at build time:

| Variable                    | Used in                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_ENDPOINT`  | `init-services.ts` via getApiBaseUrl() — backend origin; REST base is origin + /api/v1 (Socket.IO uses it bare) |
| `NEXT_PUBLIC_API_PREFIX`    | `api-config.ts` — REST version prefix appended to the endpoint (default `/api/v1`)                              |
| `NEXT_PUBLIC_APP_NAME`      | `enums/storage-keys.ts` — localStorage key prefix                                                               |
| `NEXT_PUBLIC_HMAC_SECRET`   | `hmac-signature.ts` — HMAC signing                                                                              |
| `NEXT_PUBLIC_BUILD_VERSION` | `hmac-signature.ts` — `x-version` header                                                                        |
| `NEXT_PUBLIC_LANGUAGE_CODE` | `i18n/i18n.ts` — default locale fallback                                                                        |

**Note:** `NEXT_PUBLIC_HMAC_SECRET` is client-readable. For a stronger guarantee,
move signing into a Next.js Route Handler and keep the secret server-only
(no `NEXT_PUBLIC_` prefix). The starter uses the simpler approach for parity
with the reactjs/vuejs templates.

## Service Initialization Timing

`initServices()` is called inside `useEffect` in `app/providers.tsx`. This
guarantees it only runs after hydration in the browser — never during SSR:

```ts
useEffect(() => {
  if (!initialized.current) {
    initServices();
    initialized.current = true;
  }
}, []);
```
