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
           └── refresh REFUSED (401/403) → endSession("expired", service); for the
               auth service ("MAIN"): hint + query cache cleared, auth.me pinned
               to null, router.replace("/login?redirect=<path?query#hash>");
               request rejects with the 401 (no reload). Another service's
               refused refresh ends only that service — the main session stays
           └── refresh TRANSIENT (network / 15 s timeout / 429 / 5xx) → hint kept,
               no session end, request rejects with a retryable non-401 error

Logout →  logout pending (sync, first tick) → refresh lock, or this tab's
           in-flight refresh without Web Locks (≤ 15 s) → epoch bump →
           POST /auth/logout (server revokes the refresh token, clears cookies)
           └── finally: endSession("logout", service) — hint + query cache cleared
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
2. Runs the rest under `withSessionLock(service, …)`: it takes the refresh Web
   Lock, so a refresh running in any tab lands first; without the Web Locks API
   it waits for this tab's in-flight refresh instead. The wait is capped at 15 s
   (`SESSION_WAIT_TIMEOUT_MS`); past it logout proceeds without the lock.
3. Bumps the service's session epoch and posts to `/auth/logout` (the refresh
   cookie identifies the token to revoke).
4. In a `finally` block calls `endSession("logout", service)`: hint, user and
   query cache are cleared even when the request fails. A voluntary logout fires
   no "expired" event and adds no `redirect`.

A refresh that resolves after the epoch moved writes no hint, fires no hook (not
even the failure hook) and rejects with `session_ended`.

## Session End Per Service

`endSession(reason, service)` bumps that service's epoch and notifies listeners
with `(reason, service)`. Only the auth service (`authContract.service`, "MAIN")
clears the hint and broadcasts the logout to other tabs. The subscribers in
`app/providers.tsx` — `resetQueriesOnSessionEnd` and `redirectOnSessionExpired`
— filter on `authContract.service`, so a refused refresh of another backend
leaves the user signed in.

## Return Path

A session expiry navigates client-side to `/login?redirect=<path, query and
hash>` (`loginPathWithReturn`).
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
`STORAGE_KEYS.SESSION` (`${APP_PREFIX}_SESSION`, prefix from
`NEXT_PUBLIC_APP_NAME`, default `PRISM_APP`) = `"1"` (no secret; `services/core/session.ts`) is set on
login/register/refresh and cleared on logout or refresh failure. Without it a
401 is final: no refresh request, and `/auth/me` resolves to `null` (signed out).

## Cross-Tab Refresh

The backend treats a replayed (already-rotated) refresh token as theft and
revokes **all** sessions, so two tabs must never refresh with the same cookie.
`RefreshTokenManager.refresh(sentAt)` runs under a Web Lock
(`navigator.locks.request`, `refreshLockName(service)` =
`${APP_PREFIX}:auth-refresh:<service>`). The request interceptor stamps every
request with `config._sentAt` (kept on the replay); once the lock is held the
manager compares the shared `localStorage` stamp
`${APP_PREFIX}:auth-refresh:<service>:at` with that time and skips its own
refresh when a refresh (any tab) finished after the request was sent — the
replay then carries the rotated cookies. A stamp more than 1 s in the future
(clock moved back) is ignored. Logout takes the same lock (`withSessionLock`). Without the Web Locks API it falls back to per-tab single-flight
(two tabs may then refresh at once — a documented limit).

## Cross-Tab Session Sync

`syncAuthAcrossTabs` (wired in `app/providers.tsx`) listens for the
`STORAGE_KEYS.AUTH_SYNC` storage event that login and logout write, and
re-checks the hint cookie whenever the tab regains focus or becomes visible:

- another tab logged out → this tab calls `endSession("logout", "MAIN")` (hint,
  user, query cache), then refreshes the Server Components;
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
- `Content-Type` is the exact header value axios sends (`resolveContentType`):
  `""` without a body; with one, the pinned value exactly as set, else axios's
  default for the body — `URLSearchParams` →
  `application/x-www-form-urlencoded;charset=utf-8`, a string →
  `application/x-www-form-urlencoded`, anything else → `application/json`.
- `multipart/form-data` is **not supported** with HMAC on: the browser appends a
  generated `boundary` after signing, so the signature cannot match.
- `HMACSignatureGenerator.signRequest({ method, path, contentType })` is the
  shared core: the interceptor, the bare refresh client (bodyless → `""`) and
  `server/server-api.ts` all sign through it.

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

- missing/expired access cookie or backend 401 → rejects with an
  `ApiResponseError` `{ error_code: 401 }`;
- any other failure → rejects with an `ApiResponseError` (`error_code` = HTTP
  status, 0 when unreachable; `retryable` on 0/408/429/5xx) — never `null` or
  an empty list.

The prefetch then fails, is not dehydrated, and the client query refetches
through axios, which refreshes and replays. `readServerSession()`
(`src/server/session.ts`) resolves the current user, and resolves `null` for a
401 only when the request carries no session hint (anonymous); with the hint it
rejects so the browser refreshes.

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
