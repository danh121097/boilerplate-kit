# Security + Auth

## Token Lifecycle

```
Login →  POST /auth/login
           └── backend returns { tokens: { accessToken }, user }
                 + sets httpOnly refresh cookie
           └── client: persistAuthToken(accessToken, "MAIN") → localStorage

Request → interceptor reads token from localStorage
           └── config.headers.authorization = `Bearer ${token}`

401 →    single-flight refresh via RefreshTokenManager
           └── POST /auth/refresh  (refresh token in httpOnly cookie, auto-sent)
           └── backend rotates pair, returns new accessToken in body
           └── client: persistAuthToken(newToken) → replay original request

Logout →  POST /auth/logout  (server clears httpOnly cookie)
           └── client: clearAuthTokens() → removes all localStorage tokens
```

## HMAC Request Signing

Every request gets three headers when `NEXT_PUBLIC_HMAC_SECRET` is set:

| Header | Value |
|--------|-------|
| `sig` | Base64(HMAC-SHA256(canonical string, secret)) |
| `ctime` | Unix timestamp (ms) |
| `x-version` | `NEXT_PUBLIC_BUILD_VERSION` |

Canonical string (must match backend):
```
METHOD\n
Content-Type\n
ctime\n
/normalized-path\n

```

## Per-Service Token Isolation

Multiple backends can coexist. Each service has its own localStorage slot:

```ts
// At startup in initServices():
Api.setBaseURL(adminURL, "ADMIN");
registerServiceToken("ADMIN", "MYAPP_ADMIN_TOKEN");
```

A 401 on service ADMIN only clears ADMIN's token; MAIN is unaffected.

## Security Notes

- `NEXT_PUBLIC_HMAC_SECRET` is client-readable (bundle). For production systems
  handling sensitive operations, proxy requests through a Next.js Route Handler
  that signs with a server-only secret.
- Access tokens in localStorage (XSS risk). For stricter requirements, use
  a BFF (Backend-For-Frontend) pattern with server-only sessions.
- No server actions used in the starter to minimize CSRF surface.
