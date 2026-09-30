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

## Route guards

- A guest on a protected route (`/users`) is sent to `/login?redirect=<original full path>`.
- A signed-in user on the guest-only `/login` is sent to the validated return path
  (same-origin only, `safeRedirect`), else home.
- The decision uses the synchronous session signal (the stored session, via the auth store's `isAuthenticated`) before any profile
  fetch. There is no SSR.
- Own-tab explicit logout goes to plain `/login`. A refused refresh (expired
  session) goes to `/login?redirect=<current full path>` from any page. Another
  tab's logout (or the session hint disappearing) goes to the same, from a
  protected route only; a public route stays.

Implementation: `beforeLoad` in `routes/users.tsx` (protected, `staticData.requiresAuth`) and `routes/login.tsx` (guest only).

## Boot hydration

`useAuthStore.hydrate()` restores the profile once on boot. A `401` ends the session
as expired (normal logged-out flow). A network error, timeout or 5xx keeps the session
and sets `hydrateError`, which shows the `session.unavailable` banner with a retry
button (`retryHydrate()`); see [state-management](./state-management.md#session-state--auth-store).

## Session end (no reload)

A 401 never reloads the page. Only a **refused** refresh (HTTP 401/403 from the
refresh endpoint — `isRefreshRefused`) ends a session: that service's tokens are
cleared and `endSession("expired", service)` fires (`services/core/session.ts`).
The rejected request surfaces the original 401.

Only the auth service (`authContract.service`, `MAIN`) is the user's session.
When it ends, the auth store drops the user and resets every cached query in
place (`resetQueriesOnSessionEnd` → `resetQueriesToSignedOut` — mounted
components see signed-out data, `auth.me` is pinned to `null`, nothing
refetches), and the root layout (`setupSessionExpiry` in
`services/session-expiry.ts`, via `redirectOnSessionExpired`) navigates
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
  outside a refused refresh (a 401 on the session read). When the epoch moved
  since `sinceEpoch` (the request started) it resolves `false` at once.
  Otherwise concurrent calls share one in-flight revoke — one POST, one event —
  which runs the same steps as logout below (best effort, never rejects), ends
  the session as `"expired"` and resolves `true`, so the expiry redirect
  carries `redirect=<current path>`.
- A revoke backs out — resolves `false`, posts nothing, ends nothing; the
  caller only resets local state — when the session already ended: the epoch
  moved (since `sinceEpoch`, else since the revoke started), no tokens are
  stored, or a logout is running. It checks when it starts and again once it
  holds the lock, since a refused refresh it waited for may have ended the
  session meanwhile. A logout never backs out.
- A `logout()` called while a revoke is in flight waits for it: when the
  revoke ended the session it returns (no second POST, no second event); when
  the revoke backed out it logs out normally.

Both share one private helper, `endServerSession(reason, sinceEpoch?)`.

## Logout

The nav button runs `useLogoutMutation` (disabled while `isPending`); `onSettled`
navigates to plain `/login`, so the user is routed out even when the request fails.
The auth store has no `logout` action: the "logout" session end below clears the
user, `hydrateError` and the query cache.

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
  and posts nothing. On a protected page (route `staticData.requiresAuth`)
  `setupSessionExpiry` navigates to `/login?redirect=<current full path>`; a public page stays. It skips a
  `"logout"` end while `AuthModel.isLoggingOut()` is true — set only while
  this tab's own `logout()` ends the session, whose button already navigates —
  so a local logout navigates once. A revoke waiting for the refresh lock does
  not set it, so another tab's logout during that wait still navigates;
- another tab stored tokens (login) → `onLogin` resets `auth.me`, invalidates
  every query so the profile refetches, reloads the user and re-runs the guards
  (`router.invalidate()`, only while signed in).

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

## Mock auth (before backend integration)

`VITE_AUTH_MOCK=true` answers the template's built-in endpoints in the browser —
auth (`/auth/*`) and users (`/users`) — so screens can be built before the
backend exists. It is **off by default**; turn it off and the real backend is
used with no change to screens, stores or guards.

```
VITE_AUTH_MOCK=true
# Optional — defaults: demo@example.com / password
# VITE_AUTH_MOCK_EMAIL=dev@example.com
# VITE_AUTH_MOCK_PASSWORD=s3cret-pass
```

Truthy is `"true"` or `"1"`. Implementation: `services/auth/mock-auth.ts`
(adapter), with `mock-auth-config.ts` (flag), `mock-auth-session.ts` (tokens)
and `mock-auth-responses.ts` (backend-shaped replies), plus
`services/users/mock-users.ts` (the users fixture and handlers).

- **Seam.** `mockAuthAdapter` replaces only axios's network adapter, on
  `AuthModel`'s and `UsersModel`'s clients and on the bare refresh call
  (`auth-refresh-client.ts`). Requests still run the real interceptors, and
  answers use the backend's shapes: login/register/refresh/logout/me return the
  `{ success, data }` envelope, and a wrong password is the same 401
  (`{ error_code: 401, message: "Invalid email or password!" }`) the login form
  already shows. Any other API still calls the real backend.
- **Session.** Persisted exactly like the real mode: opaque
  `mock-access|…` / `mock-refresh|…` tokens go to the same localStorage slots,
  so a reload keeps the session, an invalid access token refreshes through the
  mock, cross-tab sync and logout work. The token carries the user, so `me` and
  `refresh` need no server state.
- **Credentials.** One login pair, signed in as an `admin` so the built-in
  users screen works. `register` signs up any user, who stays signed in but
  cannot log in again (no user store) and is a plain `user`.
- **Users.** `GET /users` (offset-paginated `?page&limit`, envelope
  `{ success: true, data, meta }`) and `GET /users/:id` answer from a fixed
  fixture: the demo user plus five sample users (`MOCK_SAMPLE_USERS`), newest
  first, no passwords. Checks run in the backend's order: no session is `401`
  ("Access token required!"), a role below `admin` is `403` ("Insufficient
  permissions!"), an unknown id is `404` ("User not found!"). Users registered
  in the mock session are not added to the list. Any unknown id is `404` here; the backend answers `400` for a malformed ObjectId. Other methods and paths fall
  through to the real backend.
- **Signals.** One `console.warn` at boot (`initServices`) and a "Mock auth"
  badge (`components/mock-auth-badge.tsx`, rendered lazily by
  `routes/__root.tsx`), only while active.
- **Production guard.** In a production build the flag is ignored, with one
  `console.warn`, and the mock adapter and the users fixture are removed from
  the bundle (`import.meta.env.PROD`). The badge component is imported only
  outside production, so its code is not in a production bundle at all.
- **Limits.** Endpoints beyond auth and users still call the real backend, which
  rejects a mock token (401): point them at a backend that accepts it, or mock
  them separately. The Socket.IO handshake sends the mock token and is refused
  the same way. Tokens never expire, so expiry flows need a real backend.
