# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT, 15 min) | httpOnly cookie `accessToken` | Server (set on login, rotated on refresh) |
| Refresh token (7 d) | httpOnly cookie `refreshToken`, path `${apiPrefix}/auth` | Server (rotated on refresh, revoked on logout) |
| Session hint | readable cookie `STORAGE_KEYS.SESSION` (`${APP_PREFIX}_SESSION`, prefix from `VITE_APP_NAME`, default `PRISM_APP`) = `"1"` | Client (`services/core/session.ts`) |

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
- `Content-Type` is the exact header value axios sends (`resolveContentType`):
  `""` without a body (axios drops the header); with one, the pinned value
  exactly as set, else axios's default for the body — `URLSearchParams` →
  `application/x-www-form-urlencoded;charset=utf-8`, a string →
  `application/x-www-form-urlencoded`, anything else → `application/json`.
- `multipart/form-data` is **not supported** with HMAC on: the browser appends a
  generated `boundary` to the header after signing, so the signature cannot match.

`HMACSignatureGenerator.signRequest({ method, path, contentType })` is the shared
core. The bare refresh client (`auth-refresh-client.ts`) signs through it itself
(it bypasses the app interceptors to prevent refresh recursion); it posts no body,
so it signs an empty Content-Type. `src/server/server-api.ts` signs its SSR
fetches through it too.

**HMAC here is anti-casual-abuse only, not authentication.** `VITE_*` variables
are inlined into the client bundle, so anyone can read the secret and sign
requests. It stops drive-by scripts and naive replays, nothing more. Access
control relies on the JWT cookies; for a real integrity guarantee, sign in a
server function with a server-only secret.

## Single-flight + cross-tab refresh

`RefreshTokenManager` serializes 401 refreshes for ONE service:

```
concurrent 401s → refresh(config._sentAt) → inFlight exists → join it
                → no inFlight → Web Lock "${APP_PREFIX}:auth-refresh:<service>"
                     → a refresh finished after the request was sent? → skip, just replay
                     → else POST /auth/refresh → stamp "${APP_PREFIX}:auth-refresh:<service>:at"
```

A burst of N concurrent 401s in one tab triggers exactly ONE `POST /auth/refresh`.
Across tabs, `navigator.locks.request` makes only one tab refresh at a time. The
request interceptor stamps each request with `config._sentAt` (kept on the
replay); once the lock is held the manager compares the shared `localStorage`
stamp with that time and skips its own refresh when a refresh (any tab) finished
after the request was sent. A stamp more than 1 s in the future (clock moved
back) is ignored.
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
refresh endpoint — `isRefreshRefused`) ends that service's session:
`endSession("expired", service)`. For the auth service ("MAIN") it clears the
hint, and the subscribers in `routes/__root.tsx` — which filter on
`authContract.service` — reset the QueryClient cache, pin `auth.me` to `null`
and route to `/login` (`redirectOnSessionExpired`); the rejected request
surfaces the original 401. A refused refresh of another service ends only that
service's session — the user stays signed in. Anonymous visitors are never redirected — no
hint means no refresh attempt, so no "expired" event.

The redirect is client-side: `/login?redirect=<path, query and hash>`
(`loginPathWithReturn`). After login —
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

## Revoking a rejected session

"logout" is only ever the user signing out in this tab. Any session the server
rejects ends as "expired". Besides a refused refresh, that includes the session
read itself: when `fetchSession` (the `useMeQuery` fetcher) still gets a 401 in
the browser while the hint is set — e.g. the refresh succeeded but the replayed
read is rejected — it calls `AuthModel.revokeSession(sinceEpoch)`, which reuses
the logout internals (`endServerSession`): logout pending, lock, epoch bump, a
best-effort `POST /auth/logout`, then `endSession("expired", service)`, so the
expiry redirect carries the return path. It resolves `true` when it ended the
session and `false` — posting nothing — when the session had already ended (no
hint, a logout running, or the epoch moved since the read started). It checks
again once it holds the lock, so a refused refresh that ended the session while
the revoke waited is not ended twice. Concurrent calls share one revoke: one
POST, one event. Server functions and SSR never
revoke. `AuthModel.getSession()` (axios, browser) behaves the same way.

## Server functions (SSR reads)

`src/server/server-api.ts` forwards the access cookie to the backend and **never
refreshes on the server**. The backend scopes the refresh cookie to
`${apiPrefix}/auth`, so page and server-function requests do not carry it, and a
server-side rotation shared across concurrent reads would weaken the backend's
reuse detection.

Server-side session read (`readServerSession()` in `src/server/session.ts`,
reached only through the `getMeServerFn` handler, plus the `withSessionRefresh`
fetcher): hint set + 401 → reject so the browser refreshes; no hint + 401 →
`null` (anonymous); other failures reject with an `ApiResponseError`
(`error_code` = HTTP status, 0 when unreachable; `retryable` on 0/408/429/5xx).

When the access cookie is missing or rejected it returns
`ServerUnauthorized { hasSession }` instead of `null`. The query fetcher
(`withSessionRefresh`, `core/server-session.ts`) maps "no hint" to signed-out,
and in the browser refreshes through axios — passing when the call started, so a
refresh another tab finished since is reused — and replays the server function once (a refused refresh → 401
signed-out; a transient one → retryable error, session kept). During SSR a
hinted session throws (not cached as signed-out), so the browser refetches and
refreshes on mount.

## Logout

`AuthModel.logout()` — the user's own sign-out in this tab; it ends as
"logout", and the header then navigates to plain `/login` (no `redirect`),
whether or not the request succeeded. A logout called while a revoke is in
flight joins it (one POST, one session end, as "expired"); if that revoke backs
out because the session had already ended, the logout then runs on its own
(one POST, ends as "logout"):

1. In the first synchronous tick, before any await, marks a logout as pending
   (`beginLogout`). From then on a 401 — and any refresh already queued — rejects
   with `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`)
   and never calls `/auth/refresh`, even without the Web Locks API.
2. Runs the rest under `withSessionLock(service, …)`: it takes the refresh Web
   Lock, so a refresh running in any tab lands first; without the Web Locks API
   it waits for this tab's in-flight refresh instead. The wait is capped at 15 s
   (`SESSION_WAIT_TIMEOUT_MS`); past it logout proceeds without the lock.
3. Bumps the service's session epoch and posts to `/auth/logout` (the backend
   revokes the refresh token from its cookie and clears both cookies).
4. In a `finally` block calls `endSession("logout", service)`, which clears the hint and
   the query cache. The client is signed out even when the request fails. A
   voluntary logout fires no "expired" event and adds no `redirect`.

A refresh that resolves after the epoch moved writes no hint, fires no hook
(not even the failure hook) and rejects with `session_ended`.

## Cross-tab sync

`syncAuthAcrossTabs` (a `useEffect` in `routes/__root.tsx`) listens for the
`STORAGE_KEYS.AUTH_SYNC` storage event that login and logout write, and re-checks
the hint cookie whenever the tab regains focus or becomes visible:

- another tab logged out → this tab ends its own state only: epoch bump and
  session-end listeners with "logout" (user, query cache). It does not touch the
  hint cookie (the other tab cleared it), does not re-broadcast and posts
  nothing. No route requires auth, so it stays on the current page, which
  re-renders signed-out (`router.invalidate()` re-runs the route loaders); a template with protected routes would go to plain
  `/login` (no `redirect`) from those only. A logout seen through both the
  storage event and the focus re-check fires once;
- another tab logged in → this tab resets `auth.me`, invalidates every query so
  the profile refetches, and re-runs the route guards.

Both are guarded for SSR and tests (no `window`/`document` → no-op). The session
subscriptions live in `__root.tsx` effects with cleanup, not in `getRouter()`:
the router factory re-runs on HMR, so subscriptions there would stack.

## Query cache on session end

"Clearing the query cache" means `resetQueriesToSignedOut`
(`services/core/query-client.ts`), never `queryClient.clear()`: every query is
reset in place (in-flight fetch cancelled, data dropped, nothing refetched),
queries no component observes are removed, and `auth.me` is pinned to `null`.
Mounted components (the header, a list page) stay subscribed, so they re-render
signed-out at once, and the next login's `auth.me` invalidation — same tab or
another tab — reaches them. `clear()` would detach them and leave the old user
on screen.
