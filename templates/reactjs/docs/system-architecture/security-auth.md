# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT) | `localStorage` via `STORAGE_KEYS.ACCESS_TOKEN` | Client (`auth-token-storage.ts`) — sent as `Authorization: Bearer` |
| Refresh token | `localStorage` via `STORAGE_KEYS.REFRESH_TOKEN` | Client — sent in the body of `/auth/refresh` and `/auth/logout` |

Both keys carry the app prefix (`${APP_PREFIX}_ACCESS_TOKEN`,
`${APP_PREFIX}_REFRESH_TOKEN`), as do the Web Lock names, so two apps on one
origin never collide.

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
(it bypasses the app interceptors to prevent refresh recursion), including its
JSON body's `application/json` Content-Type.

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
`withSessionLock` runs refreshes and logout under this lock. Where the Web Locks
API is missing the manager falls back to per-tab single-flight (two tabs may then
refresh at once — a documented limit).

## Refresh eligibility

A 401 triggers an automatic refresh only when ALL are true:
1. `config._retry` is not set (not already retried).
2. The URL is not the refresh endpoint or a credential endpoint in `skipPaths`
   (`/auth/login`, `/auth/register`, `/auth/logout`) — a wrong-password 401
   surfaces as a form error, never a refresh.
3. The service holds an access or refresh token (anonymous traffic never refreshes).

## Session end (no reload)

A 401 never reloads the page. Only a **refused** refresh (HTTP 401/403 from the
refresh endpoint — `isRefreshRefused`) ends the session: the service's tokens are
cleared and `endSession("expired")` fires (`session-events.ts`). The auth store
listener drops the user and resets every cached query in place
(`resetQueriesToSignedOut` — mounted components see signed-out data, `auth.me`
is pinned to `null`, nothing refetches); the root layout navigates
client-side to `/login?redirect=<current full path>`; the rejected request
surfaces the original 401. A request that 401s again after a successful refresh
(already replayed) returns that 401 to the caller and keeps the session — only a
refused refresh ends it.

After login — and when `/login` loads while already signed in — the app goes to
`safeRedirect(redirect)`, which returns the value only when it is a string of at
most 512 characters, starts with exactly one `/`, contains no `\`, no control
character and no `://`, and is not `/login` itself (with or without a query or
trailing slash). Anything else falls back to `/`.

A **transient** refresh failure (network error, the 15 s refresh timeout, 429,
5xx) keeps the tokens and does not end the session; the request rejects with a
non-401 `ApiResponseError` carrying `retryable: true`, and the next 401 retries
the refresh. Every rejected request uses the shape `{ error_code: <status, or 0
without a response>, message, retryable? }`; `retryable` is set for no response,
408, 429 and 5xx.

On boot, `hydrate()` logs out only when `/auth/me` ends in a 401 (refresh
refused). A network error, 5xx or retryable refresh failure keeps the tokens —
the session may still be valid.

## Logout

`AuthModel.logout()`:

1. In the first synchronous tick, before any await, captures the access and
   refresh tokens and marks a logout as pending (`beginLogout`). From then on
   `getFreshToken` and the 401 interceptor reject with `SessionEndedError`
   (`{ error_code: 401, message: "session_ended" }`) and never call
   `/auth/refresh`, even without the Web Locks API.
2. Waits for this tab's in-flight refreshes (`settleInFlightRefreshes`), then
   takes the refresh lock (`withSessionLock`) so a refresh running in another
   tab stores its rotated pair first. Both waits share a 15 s cap
   (`SESSION_WAIT_TIMEOUT_MS`); after it logout proceeds without the lock.
3. Bumps the session epoch and posts `{ refreshToken }` with
   `Authorization: Bearer <access token>` — the pair a settled refresh just
   stored, else the captured one — so the backend revokes the latest token.
4. In a `finally` block clears every stored token and calls
   `endSession("logout")`, which clears the user and the query cache. The client
   is signed out even when the request fails. A voluntary logout fires no
   "expired" event and adds no `redirect`.

A refresh that resolves after the epoch moved stores no token, fires no hook
(not even the failure hook) and rejects with `session_ended`.

## Cross-tab sync

`syncAuthWithOtherTabs` (wired in the root layout) listens for `storage` events
on the token keys:

- another tab removed the tokens (logout) → this tab ends its session (user,
  query cache, guards);
- another tab stored tokens (login) → this tab resets `auth.me`, invalidates
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
