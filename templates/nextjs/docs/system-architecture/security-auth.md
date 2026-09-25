# Security + Auth

## Token Lifecycle

```
Login →  POST /auth/login
           └── backend sets httpOnly cookies: accessToken + refreshToken

Request → interceptor sends request
           └── axios: withCredentials: true (auto-includes httpOnly cookies)
           └── HMAC headers signed for request integrity

401 →    no session hint / credential endpoint → reject (401 is final, no reload)
         otherwise single-flight + cross-tab refresh via RefreshTokenManager
           └── POST /auth/refresh  (cookies auto-sent; bodyless HMAC signature)
           └── backend rotates cookies; session hint renewed
           └── interceptor: replay original request (fresh cookies now set)
           └── refresh REFUSED (401/403) → endSession("expired"): hint + query cache
               cleared, auth.me pinned to null,
               router.replace("/login?redirect=<current path>"), request rejects
               with the 401 (no reload)
           └── refresh TRANSIENT (network / 15 s timeout / 429 / 5xx) → hint kept,
               no session end, request rejects with a retryable non-401 error

Logout →  logout pending (sync, first tick) → wait ≤ 15 s for in-flight refresh
           + refresh lock → epoch bump → POST /auth/logout (server revokes the
           refresh token, clears cookies)
           └── finally: endSession("logout") — hint + query cache cleared
```

Every rejected request uses the shape `{ error_code: <status, or 0 without a
response>, message, retryable? }`; `retryable` is set for no response, 408, 429
and 5xx.

## Logout

`AuthModel.logout()`:

1. In the first synchronous tick, before any await, marks a logout as pending
   (`beginLogout`). From then on a 401 — and any refresh already queued — rejects
   with `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`)
   and never calls `/auth/refresh`, even without the Web Locks API.
2. Waits for this tab's in-flight refreshes (`settleInFlightRefreshes`), then
   takes the refresh lock (`withSessionLock`) so a refresh running in another
   tab lands first. Both waits share a 15 s cap (`SESSION_WAIT_TIMEOUT_MS`);
   after it logout proceeds without the lock.
3. Bumps the session epoch and posts to `/auth/logout` (the refresh cookie
   identifies the token to revoke).
4. In a `finally` block calls `endSession("logout")`: hint, user and query cache
   are cleared even when the request fails. A voluntary logout fires no
   "expired" event and adds no `redirect`.

A refresh that resolves after the epoch moved writes no hint, fires no hook (not
even the failure hook) and rejects with `session_ended`.

## Return Path

A session expiry navigates client-side to `/login?redirect=<current full path>`.
After login — and when `/login` loads while already signed in — the app goes to
`safeRedirect(redirect)`, which returns the value only when it is a string of at
most 512 characters, starts with exactly one `/`, contains no `\`, no control
character and no `://`, and is not `/login` itself (with or without a query or
trailing slash). Anything else falls back to `/`.

## Boot

The profile (`auth.me`) is prefetched on the server and read again in the
browser. Only a 401 ends the session; a network error or 5xx keeps the hint and
surfaces a retryable error.

## Session Hint

The tokens are httpOnly, so JS cannot tell an anonymous visitor from a user
whose 15-minute access cookie just expired. A readable cookie
`STORAGE_KEYS.SESSION` (`${APP_PREFIX}_SESSION`) = `"1"` (no secret; `services/core/session.ts`) is set on
login/register/refresh and cleared on logout or refresh failure. Without it a
401 is final: no refresh request, and `/auth/me` resolves to `null` (signed out).

## Cross-Tab Refresh

The backend treats a replayed (already-rotated) refresh token as theft and
revokes **all** sessions, so two tabs must never refresh with the same cookie.
`RefreshTokenManager` takes a Web Lock (`withSessionLock` →
`navigator.locks.request`, `${APP_PREFIX}:auth-refresh:<service>`); a tab that
waited compares the shared `localStorage` stamp
`${APP_PREFIX}:auth-refresh:<service>:at` with the time it asked and skips its
own refresh when another tab already rotated the (shared) cookies. Logout takes
the same lock. Without the Web Locks API it falls back to per-tab single-flight
(two tabs may then refresh at once — a documented limit).

## Cross-Tab Session Sync

`syncAuthAcrossTabs` (wired in `app/providers.tsx`) listens for the
`STORAGE_KEYS.AUTH_SYNC` storage event that login and logout write, and
re-checks the hint cookie whenever the tab becomes visible:

- another tab logged out → this tab ends its session (hint, user, query cache,
  guards);
- another tab logged in → this tab resets `auth.me` and invalidates every query
  so the profile refetches.

Both are guarded for SSR and tests.

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
/path\n

```

- `/path` is the request path relative to the baseURL with the query stripped.
  Query parameters — inline or via axios `params` — are never signed (the
  backend verifies `req.url.split("?")[0]`).
- `Content-Type` is the exact header value sent: the pinned value (or
  `application/json`) with a body, `""` without one. The client never adds or
  strips a charset; a pinned one is signed exactly as sent.
- `multipart/form-data` is **not supported** with HMAC on: the browser appends a
  generated `boundary` after signing, so the signature cannot match.
- The bare refresh client signs its own request (bodyless → empty Content-Type).

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

This forwards the access cookie (via `await cookies()` from `next/headers`)
and signs the request with the same HMAC the backend requires. It never
refreshes — an RSC cannot set cookies, and a rotation the browser never receives
would trigger reuse detection (all sessions revoked). Instead:

- missing/expired access cookie or backend 401 → throws `ServerAuthError`;
- any other failure → throws (never `null` / an empty list).

The prefetch then fails, is not dehydrated, and the client query refetches
through axios, which refreshes and replays. `getMeServerData()` returns `null`
only for an anonymous visitor (no session hint).

## Security Notes

- HMAC is anti-casual-abuse only, not authentication: `NEXT_PUBLIC_HMAC_SECRET`
  is inlined into the client bundle, so anyone can read it and sign requests.
  Access control relies on the JWT cookies. For a real integrity guarantee,
  proxy through a Next.js Route Handler that signs with a server-only secret.
- Tokens are httpOnly cookies (no XSS risk from client JavaScript).
- No server actions in the starter — all auth mutations go through the axios client.

## Query cache on session end

"Clearing the query cache" means `resetQueriesToSignedOut`
(`services/core/query-client.ts`), never `queryClient.clear()`: every query is
reset in place (in-flight fetch cancelled, data dropped, nothing refetched),
queries no component observes are removed, and `auth.me` is pinned to `null`.
Mounted components (the header, a list page) stay subscribed, so they re-render
signed-out at once, and the next login's `auth.me` invalidation — same tab or
another tab — reaches them. `clear()` would detach them and leave the old user
on screen.
