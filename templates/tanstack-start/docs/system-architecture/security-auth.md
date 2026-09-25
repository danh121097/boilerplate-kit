# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT, 15 min) | httpOnly cookie `accessToken` | Server (set on login, rotated on refresh) |
| Refresh token (7 d) | httpOnly cookie `refreshToken`, path `${apiPrefix}/auth` | Server (rotated on refresh, revoked on logout) |
| Session hint | readable cookie `STORAGE_KEYS.SESSION` (`${APP_PREFIX}_SESSION`) = `"1"` | Client (`services/core/session.ts`) |

The client never reads either token. `withCredentials: true` on every axios
instance lets the browser attach the cookies automatically.

Because the tokens are invisible to JS, the client cannot tell an anonymous
visitor from a signed-in user whose access cookie just expired. The **session
hint** (no secret, just `"1"`) answers that: it is set on login/register/refresh
and cleared on logout or refresh failure. No hint → a 401 is final (no refresh
request, no reload). Server functions read the same cookie.

## HMAC request signing

Every request is signed when `VITE_HMAC_SECRET` is set.

Canonical string (identical to backend `verifyHmac`):
```
METHOD\n
Content-Type\n
ctime (ms epoch)\n
/path\n
(empty line)
```

Signed with HMAC-SHA256, Base64-encoded → `sig` header. Also sends `ctime` and
`x-version` headers. Implemented in `HMACSignatureGenerator.generateSignature()`.

- `/path` is the request path relative to the baseURL with the query stripped.
  Query parameters — inline (`/users?page=2`) or via axios `params` — are never
  signed (the backend verifies `req.url.split("?")[0]`).
- `Content-Type` is the exact header value sent: the pinned value (or
  `application/json`) when there is a body, `""` when there is none (axios drops
  the header). The client never adds or strips a charset; if you pin one, it is
  signed exactly as sent.
- `multipart/form-data` is **not supported** with HMAC on: the browser appends a
  generated `boundary` to the header after signing, so the signature cannot match.

The bare refresh client (`auth-refresh-client.ts`) signs its own request manually
(it bypasses the app interceptors to prevent refresh recursion). It posts no body,
so it signs an empty Content-Type.

**HMAC here is anti-casual-abuse only, not authentication.** `VITE_*` variables
are inlined into the client bundle, so anyone can read the secret and sign
requests. It stops drive-by scripts and naive replays, nothing more. Access
control relies on the JWT cookies; for a real integrity guarantee, sign in a
server function with a server-only secret.

## Single-flight + cross-tab refresh

`RefreshTokenManager` serializes 401 refreshes for ONE service:

```
concurrent 401s → refresh() → inFlight exists → join it
                → no inFlight → Web Lock "${APP_PREFIX}:auth-refresh:<service>"
                     → another tab refreshed after we asked? → skip, just replay
                     → else POST /auth/refresh → stamp "${APP_PREFIX}:auth-refresh:<service>:at"
```

A burst of N concurrent 401s in one tab triggers exactly ONE `POST /auth/refresh`.
Across tabs, `navigator.locks.request` makes only one tab refresh at a time; a tab
that waited compares the shared `localStorage` stamp with the time it asked and
skips its own refresh when another tab already rotated the (shared) cookies.
That matters because the backend treats a replayed refresh token as theft and
revokes **all** sessions. `withSessionLock` runs refreshes and logout under this
lock. Without the Web Locks API it falls back to per-tab single-flight (two tabs
may then refresh at once — a documented limit). The lock name and the
`${APP_PREFIX}:auth-refresh:<service>:at` stamp carry the app prefix so two apps
on one origin never share them.

## Refresh eligibility

A 401 triggers an automatic refresh only when ALL are true:
1. `config._retry` is not set (not already retried).
2. The URL is not the refresh endpoint or a credential endpoint in `skipPaths`
   (`/auth/login`, `/auth/register`, `/auth/logout`) — a wrong-password 401
   surfaces as a form error, never a refresh.
3. The session hint is present (anonymous traffic never refreshes).

## Session end (no reload)

A 401 never reloads the page. Only a **refused** refresh (HTTP 401/403 from the
refresh endpoint — `isRefreshRefused`) ends the session: `endSession("expired")`
clears the hint and the QueryClient cache, pins `auth.me` to `null`, and routes
to `/login` (`redirectOnSessionExpired`, wired in `router.tsx`); the rejected
request surfaces the original 401. Anonymous visitors are never redirected — no
hint means no refresh attempt, so no "expired" event.

The redirect is client-side: `/login?redirect=<current full path>`. After login —
and when `/login` loads while already signed in — the app navigates to
`safeRedirect(redirect)`, which returns the value only when it is a string of at
most 512 characters, starts with exactly one `/`, contains no `\`, no control
character and no `://`, and is not `/login` itself (with or without a query or
trailing slash). Anything else falls back to `/`.

A **transient** refresh failure (network error, the 15 s refresh timeout, 429,
5xx) keeps the hint and the session; the request rejects with a non-401
`ApiResponseError` carrying `retryable: true`, and the next 401 retries.
Every rejected request uses the shape `{ error_code: <status, or 0 without a
response>, message, retryable? }`; `retryable` is set for no response, 408, 429
and 5xx.

## Boot

`auth.me` is read on boot (server function during SSR, then axios in the
browser). Only a 401 ends the session; a network error or 5xx keeps the hint and
surfaces a retryable error.

## Server functions (SSR reads)

`src/server/server-api.ts` forwards the access cookie to the backend and **never
refreshes on the server**. The backend scopes the refresh cookie to
`${apiPrefix}/auth`, so page and server-function requests do not carry it, and a
server-side rotation shared across concurrent reads would weaken the backend's
reuse detection.

Server-side session read (`readSessionUser()` in
`src/server/read-session-user.ts`, reached only through the `getMeServerFn`
handler, plus the `withSessionRefresh` fetcher): hint set + 401 → reject so the
browser refreshes; no hint + 401 → `null` (anonymous); 5xx → reject.

When the access cookie is missing or rejected it returns
`ServerUnauthorized { hasSession }` instead of `null`. The query fetcher
(`withSessionRefresh`) maps "no hint" to signed-out, and in the browser refreshes
through axios and replays the server function once (a refused refresh → 401
signed-out; a transient one → retryable error, session kept). During SSR a
hinted session throws (not cached as signed-out), so the browser refetches and
refreshes on mount.

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
3. Bumps the session epoch and posts to `/auth/logout` (the backend revokes the
   refresh token from its cookie and clears both cookies).
4. In a `finally` block calls `endSession("logout")`, which clears the hint and
   the query cache. The client is signed out even when the request fails. A
   voluntary logout fires no "expired" event and adds no `redirect`.

A refresh that resolves after the epoch moved writes no hint, fires no hook
(not even the failure hook) and rejects with `session_ended`.

## Cross-tab sync

`syncAuthAcrossTabs` (wired in `router.tsx`) listens for the
`STORAGE_KEYS.AUTH_SYNC` storage event that login and logout write, and re-checks
the hint cookie whenever the tab becomes visible:

- another tab logged out → this tab ends its session (hint, user, query cache,
  guards);
- another tab logged in → this tab resets `auth.me`, invalidates every query so
  the profile refetches, and re-runs the route guards.

Both are guarded for SSR and tests (no `window`/`document` → no-op).

## Query cache on session end

"Clearing the query cache" means `resetQueriesToSignedOut`
(`services/core/query-client.ts`), never `queryClient.clear()`: every query is
reset in place (in-flight fetch cancelled, data dropped, nothing refetched),
queries no component observes are removed, and `auth.me` is pinned to `null`.
Mounted components (the header, a list page) stay subscribed, so they re-render
signed-out at once, and the next login's `auth.me` invalidation — same tab or
another tab — reaches them. `clear()` would detach them and leave the old user
on screen.
