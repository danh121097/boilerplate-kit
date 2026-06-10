# Security + Auth

## Token Lifecycle

```
Login →  POST /auth/login
           └── backend sets httpOnly cookies: accessToken + refreshToken

Request → interceptor sends request
           └── axios: withCredentials: true (auto-includes httpOnly cookies)
           └── HMAC headers signed for request integrity

401 →    single-flight refresh via RefreshTokenManager
           └── POST /auth/refresh  (cookies auto-sent; bodyless HMAC signature)
           └── backend rotates cookies
           └── interceptor: replay original request (fresh cookies now set)

Logout →  POST /auth/logout  (server clears httpOnly cookies)
           └── no client action needed — cookies are gone
```

## HMAC Request Signing

Every request gets three headers when `NEXT_PUBLIC_HMAC_SECRET` is set:

| Header      | Value                                         |
| ----------- | --------------------------------------------- |
| `sig`       | Base64(HMAC-SHA256(canonical string, secret)) |
| `ctime`     | Unix timestamp (ms)                           |
| `x-version` | `NEXT_PUBLIC_BUILD_VERSION`                   |

Canonical string (must match backend):

```
METHOD\n
Content-Type\n
ctime\n
/normalized-path\n

```

## Per-Service Refresh Config

Multiple backends can coexist. Each service has its own refresh endpoint and manager:

```ts
// At startup in initServices():
Api.setBaseURL(adminURL, "ADMIN");
Api.registerInterceptors(new ApiInterceptors({
  MAIN: { endpoint: "/auth/refresh" },
  ADMIN: { endpoint: "/admin/auth/refresh" },
}));
```

A 401 on service ADMIN only triggers ADMIN's refresh; MAIN is unaffected.

## Cookie Storage Model

| Token | Storage | Lifespan | Client Access |
|-------|---------|----------|---------------|
| accessToken | httpOnly cookie | 15m | No (server-managed) |
| refreshToken | httpOnly cookie | 7d | No (server-managed) |

httpOnly cookies are inaccessible to JavaScript — no XSS exfiltration risk.
The client never reads or stores tokens; it only sends requests with
`withCredentials: true`, and the browser auto-includes the cookies.

## SSR Data Fetching

Server Components use `serverApiGet<T>(path)` to fetch with auth cookies:

```ts
import { serverApiGet } from "@/server/server-api";
const user = await serverApiGet<{ user }>(authContract.paths.me);
```

This forwards the auth cookies (via `await cookies()` from `next/headers`)
and signs the request with the same HMAC the backend requires. Returns null
if unauthenticated or the backend is unreachable.

## Security Notes

- `NEXT_PUBLIC_HMAC_SECRET` is client-readable (bundle). For production systems
  handling sensitive operations, consider proxying through a Next.js Route Handler
  that signs with a server-only secret.
- Tokens are httpOnly cookies (no XSS risk from client JavaScript).
- No server actions in the starter — all auth mutations go through the axios client.
