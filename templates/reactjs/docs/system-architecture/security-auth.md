# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT) | `localStorage` via `STORAGE_KEYS.ACCESS_TOKEN` | Client (`auth-token-storage.ts`) — sent as `Authorization: Bearer` |
| Refresh token | `localStorage` via `STORAGE_KEYS.REFRESH_TOKEN` | Client — sent in the body of `/auth/refresh` and `/auth/logout` |

Both keys carry the app prefix (`${APP_PREFIX}_ACCESS_TOKEN`,
`${APP_PREFIX}_REFRESH_TOKEN`), as do the Web Lock names
(`${APP_PREFIX}:auth-refresh:<service>`), so two apps on one origin never
collide. `getAppPrefix()` (`services/core/app-prefix.ts`) returns the prefix
(`VITE_APP_NAME`, default `PRISM_APP`).

The backend rotates the pair on every refresh and also sets an httpOnly refresh
cookie (`withCredentials: true` keeps it working). Keeping the refresh token in
`localStorage` makes it readable by any XSS; if your threat model needs more,
drop it from storage and rely on the cookie alone.

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
`x-version` headers. `HMACSignatureGenerator.signRequest({ method, path,
contentType })` is the pure signer; `generateSignature(config)` adapts an axios
request config to it.

- `/path` is the request path relative to the baseURL with the query stripped.
  Query parameters — inline (`/users?page=2`) or via axios `params` — are never
  signed (the backend verifies `req.url.split("?")[0]`).
- `Content-Type` is the exact header value axios sends, as computed by
  `resolveContentType(config)`:
  - `data === undefined` → `""` (axios drops the header);
  - otherwise the pinned Content-Type (instance default or per request, header
    name matched case-insensitively) exactly as set;
  - nothing pinned → axios's own default: `URLSearchParams` →
    `application/x-www-form-urlencoded;charset=utf-8`, a string →
    `application/x-www-form-urlencoded`, anything else (including `null`) →
    `application/json`.

  The client never adds or strips a charset; if you pin one, it is signed
  exactly as sent. The `Api` client pins `application/json` on every instance.
- `multipart/form-data` is **not supported** with HMAC on: the browser appends a
  generated `boundary` to the header after signing, so the signature cannot match.

The bare refresh client (`auth-refresh-client.ts`) signs its own request with
`signRequest` (it bypasses the app interceptors to prevent refresh recursion),
including its JSON body's `application/json` Content-Type. Its timeout is
`REFRESH_TIMEOUT_MS` (15 s).

**HMAC here is anti-casual-abuse only, not authentication.** `VITE_*` variables
are inlined into the bundle, so anyone can read the secret and sign requests.
It stops drive-by scripts and naive replays, nothing more. Access control must
rely on the JWT; if you need a real client-integrity guarantee, sign on a server
you control (proxy) with a server-only secret.

## Single-flight + cross-tab refresh

`RefreshTokenManager` serializes 401 refreshes for ONE service:

```
concurrent 401s → getFreshToken(staleToken) → inFlight exists → join it
                → no inFlight → Web Lock "${APP_PREFIX}:auth-refresh:<service>"
                     → stored access token ≠ staleToken? → another tab rotated → reuse it
                     → else POST /auth/refresh → persist new pair
```

A burst of N concurrent 401s in one tab triggers exactly ONE `POST /auth/refresh`.
Across tabs, `navigator.locks.request` makes only one tab refresh at a time; a tab
that waited re-reads the shared `localStorage` token and skips its own refresh
when another tab already rotated it. That matters because the backend treats a
replayed (already-rotated) refresh token as theft and revokes **all** sessions.
Logout runs under the same lock through `withSessionLock`. Where the Web Locks
API is missing the manager falls back to per-tab single-flight (two tabs may then
refresh at once — a documented limit), and `withSessionLock` waits for this
tab's in-flight refresh of that service instead. Either wait is capped at
`SESSION_WAIT_TIMEOUT_MS` (15 s), after which the task runs anyway.

## Refresh eligibility

A 401 triggers an automatic refresh only when ALL are true:
1. `config._retry` is not set (not already retried).
2. The URL is not the refresh endpoint or a credential endpoint in `skipPaths`
   (`/auth/login`, `/auth/register`, `/auth/logout`) — a wrong-password 401
   surfaces as a form error, never a refresh.
3. The service's `hasSession()` is true — by default, it holds an access or
   refresh token (`hasStoredSession(service)`), so anonymous traffic never
   refreshes. The same check runs again once the refresh lock is held: if
   another tab logged out meanwhile, no refresh request is made.

Per-service refresh options (`ServiceRefreshConfig` in `init-services.ts`):
`endpoint` (default `/auth/refresh`), `skipPaths` (default `[]`),
`hasSession`, and an optional `onRefreshed` hook.

## Session end (no reload)

A 401 never reloads the page. Only a **refused** refresh (HTTP 401/403 from the
refresh endpoint — `isRefreshRefused`) ends a session: that service's tokens are
cleared and `endSession("expired", service)` fires (`services/core/session.ts`).
The rejected request surfaces the original 401.

Only the auth service (`authContract.service`, `MAIN`) is the user's session.
When it ends, the auth store drops the user and resets every cached query in
place (`resetQueriesOnSessionEnd` → `resetQueriesToSignedOut` — mounted
components see signed-out data, `auth.me` is pinned to `null`, nothing
refetches), and the root layout (`redirectOnSessionExpired`) navigates
client-side to `loginPathWithReturn(<current full path>)`, i.e.
`/login?redirect=…`. Another service's refused refresh clears only that
service's tokens: the user stays signed in, the cache is kept and no redirect
happens.

A request that 401s again after a successful refresh (already replayed) returns
that 401 to the caller and keeps the session — only a refused refresh ends it.

After login — and when `/login` loads while already signed in — the app goes to
`safeRedirect(redirect)`, which returns the value only when it is a string of at
most 512 characters, starts with exactly one `/`, contains no `\`, no control
character and no `://`, and is not `/login` itself (with or without a query or
trailing slash). Anything else falls back to `/`.

Any other refresh failure (network error, the 15 s refresh timeout, 408, 429,
5xx, 400, or a 200 without an access token) keeps the tokens and does not end
the session; the request rejects with `refreshUnavailable(error)` —
`{ error_code: <refresh status, or 0>, message: "refresh_unavailable",
retryable: true }` — and the next 401 retries the refresh. Every rejected request uses the shape `{ error_code: <status, or 0
without a response>, message, retryable? }`; `retryable` is set for no response,
408, 429 and 5xx.

These helpers live in `services/core/api-errors.ts` (`toApiError`,
`isTransientHttpError`, `isUnauthorizedError`, `isRefreshRefused`,
`refreshUnavailable`, `getApiErrorMessage`, `SessionEndedError`).

On boot, `hydrate()` signs out only when `/auth/me` ends in a 401, through
`AuthModel.revokeSession(epoch)` (see below). A network error, 5xx or retryable
refresh failure keeps the tokens — the session may still be valid.
`useMeQuery` reads the same endpoint through `AuthModel.getSession()`, which
revokes the same way and resolves `null` on a 401, and rejects on anything else.

## Two ways a session ends

- `AuthModel.logout()` — only when the user signs out in this tab. Ends the
  session as `"logout"`: the login page gets no `redirect`.
- `AuthModel.revokeSession(sinceEpoch?)` — the server rejected the session
  outside a refused refresh (a 401 on the session read). When the session
  already ended (the epoch moved since the request started, no tokens are
  stored, or a logout is running) it posts nothing and resolves `false`; the
  caller only resets local state. Otherwise it runs the same steps as logout
  below (best effort, never rejects), ends the session as `"expired"` and
  resolves `true`, so the expiry redirect carries `redirect=<current path>`.
  Concurrent calls share one in-flight revoke: one POST, one event.
  A `logout()` called meanwhile waits for that revoke and returns: no second
  POST, no second event.

Both share one private helper, `endServerSession(reason, sinceEpoch?)`.

## Logout

`AuthModel.logout()` (and a revoke that goes ahead):

1. In the first synchronous tick, before any await, marks a logout of the auth
   service as pending (`beginLogout(service)`) and notes the tokens it holds.
   From then on `getFreshToken` and the 401 interceptor reject with
   `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`) and
   never call `/auth/refresh`, even without the Web Locks API.
2. Runs the rest under `withSessionLock(service, …)`: it waits for a refresh
   already running — in another tab through the Web Lock, or in this tab when
   locks are unavailable — so the rotated pair is stored first. The wait is
   capped at 15 s (`SESSION_WAIT_TIMEOUT_MS`); after it logout proceeds anyway.
   With no refresh running and no Web Locks it starts at once.
3. In one tick reads the pair to revoke (the stored one, else the pair noted in
   step 1) and bumps the session epoch (`bumpSessionEpoch(service)`), then posts
   `{ refreshToken }` with `Authorization: Bearer <access token>`, so the
   backend revokes the latest token.
4. In a `finally` block clears every stored token (`clearAuthTokens`) and calls
   `endSession(reason, service)`, which clears the user and the query cache.
   The client is signed out even when the request fails. A voluntary logout
   fires no "expired" event and adds no `redirect`.

Every token clear bumps that service's session epoch too. A refresh that
resolves after the epoch moved stores no token, fires no hook (not even the
failure hook) and rejects with `session_ended`.

## Cross-tab sync

`syncAuthAcrossTabs({ onLogin, onLogout })` (wrapped by the store's
`syncAuthWithOtherTabs`, wired in the root layout) listens for `storage` events
and compares `hasStoredSession()` for the main service against the last known
state (kept current by this tab's own token writes via `onTokensChanged`):

- another tab removed the tokens (logout) → `endSession("logout", "MAIN")`
  here (epoch, user, query cache), then `onLogout`. This tab writes no storage
  and posts nothing. On a protected page (route `staticData.requiresAuth`) the
  root layout navigates to `/login` without `redirect`; elsewhere it re-runs
  the guards;
- another tab stored tokens (login) → `onLogin` resets `auth.me`, invalidates
  every query so the profile refetches, reloads the user and re-runs the guards.

A token rotation by another tab's refresh is ignored. Guarded for tests and
non-browser contexts (no `window` → no-op).

## Query cache on session end

"Clearing the query cache" means `resetQueriesToSignedOut`
(`services/core/query-client.ts`), never `queryClient.clear()`: every query is
reset in place (in-flight fetch cancelled, data dropped, nothing refetched),
queries no component observes are removed, and `auth.me` is pinned to `null`.
Mounted components (the header, a list page) stay subscribed, so they re-render
signed-out at once, and the next login's `auth.me` invalidation — same tab or
another tab — reaches them. `clear()` would detach them and leave the old user
on screen.
