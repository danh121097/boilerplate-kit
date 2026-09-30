# Security & Auth

The flagship subsystem. A **JWT access token** (bearer header) and a **refresh
token** (sent in the refresh/logout body) live in per-service localStorage slots;
every request carries an optional **HMAC signature**. A 401 drives a
**single-flight, cross-tab-locked** refresh-and-replay per service. The service
layer never reloads the page: a refused refresh ends the session as `"expired"`
(`endSession` in `services/core/session.ts`), which the app turns into a
client-side redirect to `/login?redirect=<current path>`.

## Token Model

| Token | Where it lives | Set by | Sent as |
| --- | --- | --- | --- |
| Access (JWT, 15 min) | `localStorage[<APP_PREFIX>_ACCESS_TOKEN]` | login / register / refresh | `Authorization: Bearer` |
| Refresh | `localStorage[<APP_PREFIX>_REFRESH_TOKEN]` | login / register / every rotation | `{ refreshToken }` body of `/auth/refresh` and `/auth/logout` |

The backend also sets httpOnly cookies; this client does not rely on them.
Storing the refresh token in localStorage makes it readable by any XSS — drop it
and rely on the cookie if your threat model needs that guarantee.

Per-service token storage (`auth-token-storage.ts`) keeps each backend's pair in
its own slots, so multiple authenticated backends never collide:

```ts
getAccessToken(service) / persistAccessToken(t, service) / clearAccessToken(service)
getRefreshToken(service) / persistRefreshToken(t, service) / clearRefreshToken(service)
clearServiceTokens(service)   // drop ONE service's pair (refused refresh)
clearAuthTokens()             // drop EVERY registered service's pair (logout)
onTokensChanged(listener)     // localStorage is not reactive — writers notify here
```

The auth store mirrors token presence into a `hasToken` ref through
`onTokensChanged`, so `isAuthenticated` updates on login, refresh, logout and
interceptor-driven clears. Cross-tab sync goes through
`syncAuthAcrossTabs({ onLogin })` (`services/core/session.ts`): on every
`window` `storage` event it re-reads whether a MAIN token is stored
(`hasStoredSession`) and compares it with the last known value; this tab's own
logins and logouts (`onTokensChanged`) update that value too. When another
tab logs out, this tab ends its own session as `"logout"` (`endSession`), so the
store drops its profile and every query's data (`resetQueriesToSignedOut`, see
below), the guard state (`hasToken`) follows, and a protected page is left for
`/login?redirect=<current full path>` (a public page stays). The receiving tab writes nothing to storage and
posts nothing — the tab that logged out already revoked and cleared. When another tab logs in, this
tab resets its profile, marks every query stale (`resyncQueriesAfterLogin`, so
mounted views refetch) and re-reads the profile. A token rotation elsewhere,
where presence is unchanged, is ignored.

Every clear (`clearAccessToken`, `clearRefreshToken`, `clearServiceTokens`,
`clearAuthTokens`) bumps that service's **session epoch** (`bumpSessionEpoch` /
`getSessionEpoch` in `session.ts`). A refresh captures it before its network
call and persists nothing if it changed meanwhile — see
[Logout vs an in-flight refresh](#logout-vs-an-in-flight-refresh).

## HMAC Request Signing (`hmac-signature.ts`)

Active only when `VITE_HMAC_SECRET` is set; otherwise `generateSignature` returns
`null` and signing is skipped entirely.

```ts
// generateSignature(config) — the axios adapter
signRequest({ method: config.method, path: config.url, contentType: resolveContentType(config) });

// signRequest({ method, path, contentType = "application/json", ctime = Date.now() })
const stringToSign = [method.toUpperCase(), contentType, ctime, normalizeUrl(path), ""].join("\n");
const sig = Base64.stringify(HmacSHA256(stringToSign, secret));          // base64 HMAC-SHA256
return { sig, ctime, "x-version": xVersion };                            // headers
```

`resolveContentType(config)` returns the Content-Type axios will actually send:
`""` when `data === undefined` (axios drops the header); otherwise the pinned
value (instance default or per-request, looked up case-insensitively, or via
`AxiosHeaders.get`) exactly as set; otherwise axios's default for the body —
`URLSearchParams` → `application/x-www-form-urlencoded;charset=utf-8`, a string
→ `application/x-www-form-urlencoded`, anything else (including `null`) →
`application/json`.

- **Canonical string:** `[method, contentType, ctime, path, ""].join("\n")` — the
  trailing `""` yields a final newline. `contentType` MUST equal the header the
  request actually sends.
- **Algorithm:** HMAC-SHA256, base64-encoded (`crypto-js`).
- **Headers attached:** `sig`, `ctime`, and `x-version` (`VITE_BUILD_VERSION` or
  `1.0.0`). The server recomputes the signature and compares.

**Signing rules and limits** (the backends verify the raw `Content-Type` header
and the path with the query stripped):

- The signed path is `config.url` (relative to the baseURL) with the query and
  hash stripped (`url.split(/[?#]/)[0]`). Query params — inline or via `params` —
  are never signed.
- The signed `contentType` is the exact header sent (`resolveContentType`).
- **Never pin a charset.** A pinned value is signed exactly as sent, but browsers
  may rewrite a charset on the wire (Chrome sends `charset=UTF-8`), which breaks
  the raw-header comparison.
- **Multipart is not supported.** The browser appends a `boundary` the signer
  cannot see, so `multipart/form-data` requests fail HMAC verification. Upload
  through a signed server route, or exempt the upload route on the backend.

Attached on the request interceptor via `HeadersUtils.setAuthHeaders`. The
Socket.IO handshake signs the same way over `GET /socket` (see
[Networking & Realtime](./networking-realtime.md)).

> **Security note:** a `VITE_*` value is compiled into the bundle and shipped to
> every browser, so the client HMAC is an **anti-casual-abuse** measure (it stops
> naive scripted calls and replay after 5 minutes), **not** authentication and not
> a secret. Anyone can read it from the JS. Authorization must rest on the
> tokens; if the signature must be unforgeable, sign server-side (BFF/proxy).

## The Refresh Flow

When a request returns 401, the response interceptor (`interceptors.ts`) tries to
recover before ending the session.

### Eligibility — `canAttemptRefresh`

```ts
if (config._retry) return false;                     // already replayed once
if (isRefreshExempt(config, options)) return false;  // refresh endpoint + skipPaths
return options.hasSession();                         // default hasStoredSession(service)
```

So: never loop (`_retry` guard), never refresh a **credential endpoint** (a 401
from login means a wrong password, not an expired session — the error reaches
the form untouched), never trigger a refresh storm for anonymous requests.
Exempt paths are the refresh `endpoint` plus `skipPaths` (default `[]`;
`init-services.ts` passes the auth contract's login, register and logout paths),
matched against the request path without query or hash (`path === p ||
path.endsWith(p)`).

### Single-Flight + Cross-Tab Lock — `RefreshTokenManager`

One manager per service. A burst of concurrent 401s triggers **exactly one**
network refresh — every caller awaits the same in-flight promise. Across tabs
(which share one localStorage refresh token, and the backend revokes **every**
session when a rotated refresh token is reused) the refresh runs under
`navigator.locks.request("<APP_PREFIX>:auth-refresh:<service>")` (prefixed with
`VITE_APP_NAME`, like the storage keys, so apps sharing an origin never share it):

```ts
getFreshToken(staleToken) {
  if (this.inFlight) return this.inFlight;             // dedupe this tab's callers
  this.inFlight = withRefreshLock(name, async () => {
    const current = getAccessToken(service);
    if (staleToken && current && current !== staleToken) return current; // another tab rotated it
    const token = await this.refresh();                // network refresh
    persistAccessToken(token, service);
    return token;
  }).finally(() => { this.inFlight = null; });
  return this.inFlight;
}
```

`staleToken` is the bearer the failed request was sent with. Once the lock is
held the manager also rejects with `SessionEndedError` (no network call) when
the session ended meanwhile: a moved epoch, a running logout, or
`isSessionAlive()` (wired to the service's `hasSession`) returning false — e.g.
another tab logged out while this one waited. When `navigator.locks` is
unavailable it falls back to the unlocked single-flight behavior.

Only 401/403 from the refresh call ends the session (`isRefreshRefused`);
every other failure is transient:

| Refresh outcome | Tokens | Effect |
| --- | --- | --- |
| 401/403 (revoked, reuse detected, expired) | cleared | `onRefreshFailed` → `endSession("expired", service)`; the request rejects with its original 401 |
| Network error, timeout (15s), 400, 408, 429, 5xx, 200 without an access token | kept | rejects with `refreshUnavailable(error)` (`message: "refresh_unavailable"`, `retryable: true`, `error_code` = status or 0) |

Every rejection reaching a caller has the shape
`{ error_code: <HTTP status or 0>, message, retryable? }` (`toApiError`).

### The Refresh Call — `auth-refresh-client.ts`

Runs on a **bare axios instance**, NOT the app client, so a 401 from the refresh
request can never recurse back into the refresh interceptor. It must re-attach
HMAC headers itself, signing the same body and `Content-Type` it sends:

```ts
const body = { refreshToken: getRefreshToken(service) ?? undefined };
const signature = HMACSignatureGenerator.signRequest({ method: "POST", path: endpoint, contentType: "application/json" });
const { data } = await axios.post(url, body, { withCredentials: true, headers, timeout: REFRESH_TIMEOUT_MS });
// rotated pair (tolerates several envelope shapes; a missing access token throws
// "refresh_response_missing_access_token", which is transient) — the manager
// persists it, unless the session ended while the call was in flight
return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
```

### Replay — `refreshAndRetry`

```ts
config._retry = true;                                  // mark before replaying
return ctx.manager.getFreshToken(sentAccessToken(config)).then(
  (token) => { config.headers.authorization = `Bearer ${token}`; return instance(config); },
  (error) => Promise.reject(
    error instanceof SessionEndedError ? error         // logout ran meanwhile
    : isRefreshRefused(error) ? unauthorized           // the original 401 (session ended)
    : refreshUnavailable(error),                       // transient, session kept
  ),
);
```

The replay's own outcome propagates as-is: a later 500 — or a 401 again —
neither clears the freshly minted token nor ends the session. The refresh
endpoint is the only authority on session validity; a resource-level 401 after
a successful rotation just rejects to the caller, and `_retry` bounds the cost
to one refresh per request.

### When Refresh Is Not Attempted

A 401 that is not eligible (credential endpoint, anonymous, already replayed, or
a service **without** refresh config) rejects with `toApiError(error)` and
touches nothing. Nothing in the service layer reloads the page.

## Route guards

- A guest on a protected route (`/users`) is sent to `/login?redirect=<original full path>`.
- A signed-in user on the guest-only `/login` is sent to the validated return path
  (same-origin only, `safeRedirect`), else home.
- The decision uses the synchronous session signal (the persisted access token, via the auth store's `isAuthenticated`) before any profile
  fetch. There is no SSR.
- Own-tab explicit logout goes to plain `/login`. A refused refresh (expired
  session) goes to `/login?redirect=<current full path>` from any page. Another
  tab's logout (or the session hint disappearing) goes to the same, from a
  protected route only; a public route stays.

Implementation: `router/auth-guard.ts` (`authGuard`, a global `beforeEach`) reading the `requiresAuth` / `guestOnly` route meta set in `router/index.ts`.

## Session End → `/login`

`services/core/session.ts` carries the session-end pub/sub:
`endSession(reason, service)` bumps that service's epoch, then notifies
`onSessionEnded((reason, service) => …)` listeners. Reasons are `"logout"`
(the user signed out — in this tab, or another tab's logout) and `"expired"`
(every server-rejected session: a refused refresh, or a session revoked by
`AuthModel.revokeSession()`).

- The auth store subscribes and, for the MAIN service, drops the user and the
  hydrate error, re-syncs `hasToken` and calls `resetQueriesToSignedOut`
  (`services/core/query-client.ts`): every query reset in place — no refetch,
  in-flight fetches cancelled — unobserved ones removed, `auth.me` pinned to
  `null`. Never `queryClient.clear()`, which would leave mounted views attached
  to dead queries showing the old user's data.
- `plugins/session-expiry.ts` (after Pinia + router are installed) registers
  `redirectOnSessionExpired(redirect, authContract.service)`: only an
  `"expired"` end of the auth service navigates, client-side, to
  `loginPathWithReturn(currentRoute.fullPath)` (`/login?redirect=<encoded
  path>`), unless already on the login page. Another tab's logout
  leaves a protected route (`meta.requiresAuth`) for
  `/login?redirect=<current full path>` (a public page stays); this tab's own logout (`AuthModel.isLoggingOut()` is true while
  `AuthModel.logout()` ends the session) is skipped, since the logout mutation navigates
  itself. A revoke waiting for the refresh lock does not set it, so another
  tab's logout during that wait still leaves the protected route.

## Boot Hydration and Logout (`stores/auth.ts`)

- `hydrate()` resolves the profile when a token is stored. On a 401 (after the
  refresh attempt) it calls `AuthModel.revokeSession(sinceEpoch)` and resets
  local state (see "Revoking a rejected session" below). A network error, timeout or 5xx keeps the tokens and sets
  `hydrateError` (`retryable: true`); `App.vue` shows a `role="alert"` banner
  (`session.unavailable`) with a `session.retry` button that calls
  `retryHydrate()`, and the banner disappears once the restore succeeds. A 401
  never sets `hydrateError`: it is the normal logged-out flow.
- Logout is `useLogoutMutation` in `App.vue` (the button is disabled while it is
  pending). `AuthModel.logout()` posts `{ refreshToken }` to `/auth/logout` (so
  the backend revokes it), clears tokens and ends the session as `"logout"`,
  even if the request fails; the store's `onSessionEnded` listener then resets
  the profile, `hydrateError` and every query's data. `onSettled` (not
  `onSuccess`, so a failed call still signs out) only navigates to `/login`
  without a `redirect`; nothing clears a second time, so tokens another tab just
  wrote are never wiped. The store has no `logout` or `clearSession` action.
- A profile read that returns after the session ended (for example a Retry that
  was in flight when the user logged out) is dropped: `hydrate()` captures the
  session epoch first and applies the result only if the epoch is unchanged and
  a session is still stored. The banner's Retry button is disabled while a retry
  runs (`retrying`); concurrent `retryHydrate()` calls share one run, while a
  login in another tab always starts its own profile read.

- The login view follows `?redirect=` after signing in, and the router guard
  (`router/auth-guard.ts`) does the same when a signed-in user opens `/login`.
  Both go through `safeRedirect(value)` (`services/core/session.ts`), which keeps
  the value only when it is a string of at most 512 chars, starts with exactly
  one `/`, contains no `\`, no control character (`[\u0000-\u001F\u007F]`, which
  URL parsers strip) and no `://`, and is not the login page itself (`/login`,
  `/login/`, `/login?…`, `/login#…`; `/login/callback` is allowed); otherwise `/`.
  The view shows the server's error message (`getApiErrorMessage`) on failure.

### Revoking a rejected session

`AuthModel.revokeSession(sinceEpoch?): Promise<boolean>` handles a session the
server rejects outside a refused refresh — a 401 on the session read (`hydrate`,
or `getSession` behind `useMeQuery`) that survived a successful refresh. It
shares `logout`'s internals (the private `endServerSession(reason,
sinceEpoch?)`: token capture, lock, epoch bump, `POST /auth/logout`, clear) but
ends the session as `"expired"`, so the expiry redirect keeps a return path.

It backs out — posts nothing, ends nothing, resolves `false` — when a logout is
already running, or when the session already ended: the epoch moved since
`sinceEpoch` (else since the call started — e.g. a refused refresh that held the
lock ended it) or no token is stored. That check runs on entry, before the
logout flag is set or the lock requested (a session that already ended takes no
lock), and again once the refresh lock is held (the in-lock re-check). The
caller then only resets local state. Otherwise it resolves `true`, also when the request
failed (best effort: the session is ended locally either way). Concurrent
callers share one in-flight revoke: one request, one session end. A `logout()`
during a revoke waits for it; if the revoke backed out, the logout then runs
normally (one request, ending as `"logout"`).

### Logout vs an in-flight refresh

`AuthModel.logout` (and `revokeSession`, through the same helper, unless it backs out on entry) marks a logout as running (`const done = beginLogout(service)`,
a counter, so overlapping logouts never clear each other's flag) in its first
tick, then runs through `withSessionLock(service, …)`: under the same
`<APP_PREFIX>:auth-refresh:<service>` Web Lock as the refresh (or, without `navigator.locks`,
after this tab's in-flight refresh settles). The wait is capped at 15s
(`SESSION_WAIT_TIMEOUT_MS`); past it logout proceeds unlocked. A running refresh therefore finishes
first and logout sends — and revokes — the freshly rotated refresh token. In
this tab, a refresh queued behind logout finds the session ended
(`isLogoutPending` or a moved epoch). In another tab, one queued behind the lock
finds both token slots empty (shared localStorage) and rejects with
`SessionEndedError` without calling `/auth/refresh`. If the session is cleared
while a refresh call is in flight anyway, the manager sees the changed session
epoch, persists nothing and rejects with `SessionEndedError` (`error_code` 401) —
no tokens are written back after logout.

A logout also closes the window while it waits and while its own request is in
flight. From its first tick every new refresh — including a 401 arriving
mid-logout — rejects at once with `SessionEndedError`
(`{ error_code: 401, message: "session_ended" }`) and never calls
`/auth/refresh`. Both tokens are captured when logout starts, before any await.
Once the lock is held, in one synchronous tick it picks the tokens to revoke —
the ones stored now, else the copy captured at the start if storage was emptied
meanwhile — and bumps the session epoch (`bumpSessionEpoch`). It then posts
`{ refreshToken }` with `Authorization: Bearer <captured access token>`. So the
server cannot rotate the token logout is revoking. In a `finally` it clears the
tokens and calls `endSession("logout", service)`, so tokens, user and query
cache are cleared even when the request fails; a voluntary logout never ends
the session as `"expired"` and navigates to `/login` without a `redirect`. The `done()` returned by
`beginLogout` lifts the block afterwards (idempotent).

**Known limit:** two tabs **without** `navigator.locks`. The session epoch and the
logout-in-progress flag live in each tab's memory, so another tab's refresh can
still land after this tab logs out. Every current browser has Web Locks, which
close this gap.

## Per-Service Refresh Config

`ApiInterceptors` is built from a `Record<service, ServiceRefreshConfig>`. A
service is auto-refreshed **iff it appears in that map**; omit it to opt out (its
401s just reject). `ServiceRefreshConfig` = `Partial<{ endpoint, skipPaths,
hasSession, onRefreshed }>`. Defaults: `endpoint: "/auth/refresh"`,
`skipPaths: []`, `hasSession: () => hasStoredSession(service)`. Managers are
built lazily and cached per service.

## End-to-End 401 Sequence

```
request → 401
   │
   ├─ canAttemptRefresh?  (not _retry, not exempt, hasSession())
   │        │ no → reject toApiError(error); nothing cleared
   │        │ yes
   ├─ config._retry = true
   ├─ RefreshTokenManager.getFreshToken(sentToken)  ← concurrent 401s share ONE call
   │        ├─ navigator.locks "<APP_PREFIX>:auth-refresh:<service>" (cross-tab)
   │        ├─ session ended meanwhile? → SessionEndedError, no network call
   │        ├─ token already rotated by another tab? → use it
   │        ├─ bare-axios POST /auth/refresh ({ refreshToken } + HMAC) → new pair
   │        ├─ 401/403 → clear tokens, endSession("expired") → /login; reject original 401
   │        └─ anything else → reject refreshUnavailable (retryable), session kept
   └─ replay request with `Bearer <newToken>` → original outcome propagates
```

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
  badge (`components/mock-auth-badge.vue`, rendered by `App.vue`), only while
  active.
- **Production guard.** In a production build the flag is ignored, with one
  `console.warn`, and the mock adapter and the users fixture are removed from
  the bundle (`import.meta.env.PROD`). The badge component is imported only
  outside production, so its code is not in a production bundle at all.
- **Limits.** Endpoints beyond auth and users still call the real backend, which
  rejects a mock token (401): point them at a backend that accepts it, or mock
  them separately. The Socket.IO handshake sends the mock token and is refused
  the same way. Tokens never expire, so expiry flows need a real backend.
