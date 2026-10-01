# Security & Auth

The flagship subsystem. Auth is **cookie-first**: the backend sets an httpOnly
**access cookie** (15 min) and an httpOnly **refresh cookie** (scoped to the
backend's `/api/v1/auth` routes); the client never stores or reads a token. Every request carries
an **HMAC signature** (required by the bundled backends). In the browser a 401 drives a **single-flight,
cross-tab-locked** refresh-and-replay per service. The service layer never
reloads the page: a refused refresh ends the session as `"expired"`
(`endSession` in `services/core/session.ts`), which the app turns into a cache
reset + client-side redirect to `/login?redirect=<current path>`.

## Token Model

| Token | Where it lives | Set by | Read by JS? | Sent on SSR fetches? |
| --- | --- | --- | --- | --- |
| Access (JWT, 15 min) | httpOnly cookie `accessToken` (path `/`) | backend on login / register / refresh | **no** | yes — `serverApiGet` forwards the incoming `cookie` header |
| Refresh | httpOnly cookie `refreshToken` (path `<API_PREFIX>/auth`) | backend on login / every rotation | **no** | **no** — the browser only sends it to the auth routes |
| Session hint | readable cookie `<APP_NAME>_SESSION=1` (path `/`, 7 days) | this app on login / register / refresh success; cleared when the session ends | yes | yes |

The **session hint** (`hasSessionHint`, `markSessionActive`,
`clearSessionHint` in `services/core/session.ts`) carries no secret — it
only tells JS (and SSR) whether a session is believed to exist, since the real
cookies are unreadable. It drives UX only and is **never** trusted for
authorization: without it a 401 is anonymous (no refresh call); with it a
refused refresh ends the session and routes to `/login`.

Consequence: only the **browser** can refresh. SSR reads (`serverApiGet`, …)
never refresh; a 401 there is ambiguous (anonymous, or an access cookie that
merely expired) and is handed to the browser — see
[Session reads](#session-reads-ssr-vs-browser).

## Route guards

- A guest on a protected route (`/users`) is sent to `/login?redirect=<original full path>`.
- A signed-in user on the guest-only `/login` is sent to the validated return path
  (same-origin only, `safeRedirect`), else home.
- The decision uses the synchronous session signal (the readable session hint cookie) before any profile
  fetch. The route middleware runs on the server during SSR (request cookie) and on client navigations (`document.cookie`), so a guest never sees a flash of the protected page. A hint whose tokens have expired still passes: the client refreshes
  through the normal 401 flow.
- Own-tab explicit logout goes to plain `/login`. A refused refresh (expired
  session) goes to `/login?redirect=<current full path>` from any page. Another
  tab's logout (or the session hint disappearing) goes to the same, from a
  protected route only; a public route stays.
- The URL `#fragment` is not preserved on a server-side guest redirect (the
  server never receives it).

Implementation: named route middleware `app/middleware/auth.ts` and `app/middleware/guest.ts`, attached with `definePageMeta({ middleware: "auth" })` in `pages/users.vue` and `"guest"` in `pages/login.vue`.

## HMAC Request Signing (`hmac-signature.ts`)

Signing is active when `runtimeConfig.public.hmacSecret` (`NUXT_PUBLIC_HMAC_SECRET`)
is set; with an empty secret the signer returns `null` and no headers are sent.
The bundled backends require the headers and the secret must equal their
`HMAC_SECRET`, so an empty secret against a real backend makes every request
fail with 401. Dev builds log one `console.warn` for it (not in production, not
while mock auth is on; the secret is never printed). The secret is read via `useRuntimeConfig()`
(lazily, inside a `try/catch`) — **never** `import.meta.env`:

```ts
signRequest({ method, path, contentType = "application/json", ctime = Date.now() }) {
  const stringToSign = [method.toUpperCase(), contentType, ctime, normalizeUrl(path), ""].join("\n");
  return { sig: Base64.stringify(HmacSHA256(stringToSign, secret)), ctime, "x-version": xVersion };
}
// axios adapter
generateSignature(config) {
  return signRequest({ method: config.method, path: config.url, contentType: resolveContentType(config) });
}
```

`resolveContentType(config)` returns the Content-Type axios will actually send:
`""` when `data === undefined` (axios drops the header); otherwise the pinned
value (instance default or per-request, looked up case-insensitively, or via
`AxiosHeaders.get`) exactly as set; otherwise axios's default for the body —
`URLSearchParams` → `application/x-www-form-urlencoded;charset=utf-8`, a string
→ `application/x-www-form-urlencoded`, anything else (including `null`) →
`application/json`.

- **Canonical string:** `[method, contentType, ctime, path, ""].join("\n")` — the
  backend verifies against the raw `Content-Type` header it receives.
- **Algorithm:** HMAC-SHA256, base64-encoded (`crypto-js`).
- **Headers attached:** `sig`, `ctime`, and `x-version`
  (`runtimeConfig.public.buildVersion`, default `1.0.0`).

**Signing rules and limits** (the backends verify the raw `Content-Type` header
and the path with the query stripped):

- The signed path never includes `?query` or `#hash`; an inline query in the
  request URL is dropped before signing.
- The signed Content-Type is exactly the header sent (`resolveContentType`).
  Never pin a `charset` — browsers
  may rewrite it on the wire (Chrome sends `charset=UTF-8` for `utf-8`), which
  breaks the raw-header comparison. Bodies are UTF-8.
- **Multipart is not supported.** The browser appends a `boundary` the signer
  cannot see, so `multipart/form-data` requests fail HMAC verification. Upload
  through a server route you add (e.g. `server/api/...`) that signs the request, or exempt the upload route on the backend.

Signed by the axios request interceptor (`HeadersUtils.setAuthHeaders`), the bare
refresh client, `serverApiGet` (SSR), and the Socket.IO handshake over
`GET /socket` (see [Networking & Realtime](./networking-realtime.md)).

> **Security note:** the browser must sign too, so the secret has to be in
> `runtimeConfig.public` — which is serialized into the page payload and readable
> by anyone. The client HMAC is therefore an **anti-abuse / light integrity**
> layer, **not** a security boundary or authentication: the signature covers the
> method, Content-Type, timestamp and path only (no body hash, no nonce), and the
> backend accepts a `ctime` within ±5 minutes. Authorization rests on the httpOnly
> cookies. Do **not** move the
> secret to a private (non-`public`) `runtimeConfig.hmacSecret`: the browser
> signer would then have no secret and every client request would fail HMAC
> verification. If the signature must be unforgeable, route browser traffic
> through a server-side proxy (Nitro route / BFF) that signs with a private
> secret, and point the browser at that proxy instead of the backend.

### `HMAC_ERROR` is not a session verdict

A backend 401 with `errorType: "HMAC_ERROR"` (bad signature, wrong secret or
clock skew) is normalized by `toApiError` with `retryable: true`.
`isHmacError` is true for it, while `isUnauthorizedError` and `isRefreshRefused`
are false: the browser does not refresh, the session is kept, and the layout's
retry banner shows. SSR (`serverApiGet`) rejects the same way and logs one
server-side warning per process; the browser logs one dev warning. Fix the device
clock or the secret, then retry.

### Tokens in the JSON body (accepted risk)

In cookie mode the backend still returns the tokens in the JSON body of
login / register / refresh, and the client ignores them. Script running on the
page (XSS) can therefore call `/auth/refresh` and read a fresh refresh token from
the response, despite the httpOnly cookie. This is an accepted risk; the
mitigation (a backend opt-in to omit tokens from the body in cookie mode) is
backlog.

## The Refresh Flow (browser)

When a request returns 401, the response interceptor (`interceptors.ts`) tries to
recover before ending the session.

### Eligibility — `canAttemptRefresh`

```ts
if (config._retry) return false;                     // already replayed once
if (isRefreshExempt(config, options)) return false;  // refresh endpoint + skipPaths
return options.hasSession();                         // default hasSessionHint
```

The cookies are invisible to JS, so eligibility gates on the readable session
hint: an anonymous visitor's 401 is final — no refresh request. **Credential endpoints** are
never refreshed — a 401 from login is a wrong password, and the error reaches the
form untouched. Exempt paths are the refresh `endpoint` plus `skipPaths`
(default `[]`; `01.init-services.ts` passes the auth contract's login, register
and logout paths), matched against the request path without query or hash
(`path === p || path.endsWith(p)`).

### Single-Flight + Cross-Tab Lock — `RefreshTokenManager`

One manager per service. A burst of concurrent 401s triggers **exactly one**
network refresh — every caller awaits the same in-flight promise. Across tabs
(which share the refresh cookie; the backend revokes **every** session when a
rotated refresh token is reused) the refresh runs under
`navigator.locks.request("<APP_NAME>:auth-refresh:<service>")` (app-prefixed, so
several apps on one origin never share it). Because the cookies are
unreadable, tabs share *when* they last rotated them instead:

```ts
refresh(sentAt) {                                   // sentAt = config._sentAt (request interceptor)
  if (this.inFlight) return this.inFlight;
  this.inFlight = withRefreshLock(name, async () => {
    // timestamps later than now (+1 s) are ignored: the clock moved back
    const last = Math.max(this.refreshedAt, Number(localStorage["<APP_NAME>:auth-refresh:<service>:at"]));
    if (sentAt !== undefined && last > sentAt) return; // rotated after the request was sent → just replay
    await this.doRefresh();
    this.refreshedAt = Date.now();                  // + shared localStorage timestamp, renew hint
  }).finally(() => { this.inFlight = null; });
  return this.inFlight;
}
```

Once the lock is held the manager also rejects with `SessionEndedError` (no
network call) when the session ended meanwhile: a moved epoch, a running
logout, or `isSessionAlive()` (wired to the service's `hasSession`, i.e. the
hint) returning false — e.g. another tab logged out while this one waited.
Without `navigator.locks` it falls back to the unlocked single-flight behavior.

Only 401/403 from the refresh call ends the session (`isRefreshRefused`);
every other failure is transient:

| Refresh outcome | Effect |
| --- | --- |
| 401/403 (revoked, reuse detected, expired) | `onRefreshFailed` → `endSession("expired", service)`; the request rejects with its original 401 |
| Network error, 15 s timeout, 400, 408, 429, 5xx | rejects with `refreshUnavailable(error)` (`message: "refresh_unavailable"`, `retryable: true`, `error_code` = status or 0); session kept |
| Session ended while in flight (logout) | rejects with `SessionEndedError` (`{ error_code: 401, message: "session_ended" }`); nothing persisted, no hooks |

### The Refresh Call — `auth-refresh-client.ts`

Runs on a **bare axios instance** (no interceptors, so a 401 from it cannot
recurse). Bodyless — the refresh cookie is the credential — so it signs `""` as
the Content-Type, matching the header axios does not send:

```ts
const signature = HMACSignatureGenerator.signRequest({ method: "POST", path: endpoint, contentType: "" });
await axios.post(`${Api.getBaseURL(service)}${endpoint}`, undefined, {
  withCredentials: true, headers, timeout: REFRESH_TIMEOUT_MS, // 15 s
});
```

### Replay — `refreshAndRetry`

```ts
config._retry = true;
return ctx.manager.refresh(config._sentAt).then(
  () => instance(config),                               // browser re-attaches the fresh cookie
  (error) => Promise.reject(
    error instanceof SessionEndedError ? error          // logout ran meanwhile
    : isRefreshRefused(error) ? unauthorized            // the original 401 (session ended)
    : refreshUnavailable(error),                        // transient, session kept
  ),
);
```

The replay's own outcome propagates as-is: a post-refresh 500 is a genuine 500,
and a post-refresh 401 just rejects to the caller without ending the session.
The refresh endpoint is the only authority on session validity; `_retry` bounds
the cost to one refresh per request.

`ApiInterceptors.refreshSession(service = "MAIN", sentAt?)` runs the same
single-flight refresh outside the response interceptor.

### When Refresh Is Not Attempted

A 401 that is not eligible (credential endpoint, no hint, already replayed, or
a service without refresh config) rejects with `toApiError(error)`. httpOnly
cookies cannot be cleared from JS, and nothing reloads the page.

## Session End → `/login`

`services/core/session.ts` carries the session-end pub/sub:
`endSession(reason, service)` bumps that service's epoch; for the MAIN service
it also clears the hint and broadcasts `logout` to the other tabs
(`<APP_NAME>_AUTH_SYNC`); then it notifies `onSessionEnded((reason, service) =>
…)` listeners. Reasons are `"logout"` (the user signed out — in this tab, or
another tab's logout) and `"expired"` (every server-rejected session: a refused
refresh, or a session revoked by `AuthModel.revokeSession()`). A remote logout
does not go through `endSession`'s broadcast: the private
`finishSession(reason, service, announce)` runs with `announce` false — epoch
bumped, listeners notified, the hint neither touched nor re-broadcast (see "Cross-tab session
sync").

`plugins/04.session-expiry.client.ts` registers once:

- `resetQueriesOnSessionEnd(queryClient, "auth.me", authContract.service)` —
  on any end of the auth service, `resetQueriesToSignedOut`
  (`services/core/query-client.ts`: every query reset in place — no refetch,
  in-flight fetches cancelled — unobserved ones removed, the session pinned to
  `null`; never `queryClient.clear()`, or a mounted `useMeQuery` would stay
  attached to a dead query and miss the next login's invalidation);
- `redirectOnSessionExpired(redirect, authContract.service)` — only on
  `"expired"`, a client-side `navigateTo(loginPathWithReturn(fullPath))`
  (`/login?redirect=<encoded path>`), unless already on `/login`.

`pages/login.vue` returns there after signing in — and when it loads while
already signed in — through `safeRedirect(value, "/")` (`services/core/session.ts`), which
falls back to `/` unless the value is at most 512 characters, starts with
exactly one `/`, and contains no `\`, no control character (URL parsers strip
them) and no `://`; the login page itself (`/login`, `/login/`, `/login?…`,
`/login#…`) is rejected so the redirect cannot loop, while `/login/callback` is allowed. The hint covers a
cold page load with an expired access cookie and a dead refresh cookie, where
nothing is cached yet: the refresh is attempted and its refusal ends the session.

### Revoking a rejected session

`AuthModel.revokeSession(sinceEpoch?): Promise<boolean>` handles a session the
server rejects outside a refused refresh: a browser-side 401 on the session read
(`AuthModel.getSession()` behind `useMeQuery`) that survived the refresh while
the hint is set. It shares `logout`'s steps below (the private
`endServerSession(reason, sinceEpoch?)`) but ends the session as `"expired"`, so
`04.session-expiry.client.ts` routes to `/login?redirect=…`. It backs out —
posts nothing, ends nothing, resolves `false` — when a logout is already
running, or when the session already ended: the epoch moved since `sinceEpoch`
(else since the call started — e.g. a refused refresh that held the lock ended
it) or the hint is gone (an anonymous visitor). That check runs on entry, before
the logout flag is set or the lock requested (a session that already ended
takes no lock), and again once the refresh lock is held (the in-lock re-check).
Otherwise it
resolves `true`, also when the request failed (best effort: the session is
ended locally either way). Concurrent callers share one in-flight revoke: one
request, one session end. A `logout()` during a revoke waits for it; if the
revoke backed out, the logout then runs normally (one request, ending as
`"logout"`).
SSR never revokes (`readServerSession` keeps returning `null` or rejecting).

### Logout vs an in-flight refresh

`AuthModel.logout` (and `revokeSession`, through the same helper, unless it backs out on entry):

1. Synchronously, before any await, calls `const done = beginLogout(service)` (a
   counter, so overlapping logouts never clear each other's flag). From then until
   logout settles, every **new** refresh — including a 401 arriving mid-logout —
   rejects at once with `SessionEndedError` and never calls `/auth/refresh`.
2. Runs the rest through `withSessionLock(service, …)`: under the same Web Lock
   as the refresh (or, without `navigator.locks`, after this tab's in-flight
   refresh settles). A running refresh finishes first, so logout revokes the
   freshly rotated cookie. The wait is capped at 15 s (`SESSION_WAIT_TIMEOUT_MS`);
   a hung refresh cannot block logout.
3. Inside the lock, bumps the session epoch (`bumpSessionEpoch(service)`), then POSTs
   `/auth/logout` — the browser sends the refresh cookie; there is no readable
   access token, so no `Authorization` header.
4. In a `finally`, calls `endSession("logout", service)` — hint cleared, other
   tabs told, query cache reset — even when the request fails, then `done()`
   lifts the block (idempotent); `isLogoutPending(service)` is false again once
   every running logout finished.

Every refresh captures the session epoch and, if it changed while the call was
in flight, rejects with `SessionEndedError` without running `onRefreshed` — the
hint is never written back after logout. A voluntary logout never ends the
session as `"expired"` and adds no `?redirect=`; `layouts/default.vue` routes to
`/login`.

### Cross-tab session sync

The cookies are shared by every tab. `plugins/05.session-sync.client.ts` calls
`syncAuthAcrossTabs({ onLogin, onLogout })` (`services/core/session.ts`), which follows
two signals:

- the `<APP_NAME>_AUTH_SYNC` localStorage `storage` event — `startSession()`
  (login / register) broadcasts `login`, `endSession` broadcasts `logout` for
  the MAIN service;
- a hint re-read on window `focus` and `visibilitychange` (when visible),
  compared with the last value this tab wrote or saw — this also catches a hint
  that expired.

| Change | Effect |
| --- | --- |
| signed out elsewhere | this tab ends its session as `"logout"` — epoch bumped, `resetQueriesOnSessionEnd` drops every query's data in place, session `null`. It never re-broadcasts, never touches the (shared) hint cookie and posts nothing; the broadcast and a later focus re-read of the same logout end it once. `onLogout` sends a page using the `auth` middleware to `/login?redirect=<current path>`; a public page stays |
| signed in elsewhere | `onLogin` → `resyncQueriesAfterLogin` — session reset, every query stale; mounted ones refetch |

The shared refresh timestamp (`<APP_NAME>:auth-refresh:<service>:at` in
localStorage) keeps tabs from rotating the same refresh cookie twice.

**Known limits:** another tab signing in as a **different** user while the
hint stays set is not detected until the next 401 or reload. Two tabs **without** `navigator.locks`: the session epoch and the
logout-in-progress flag live in each tab's memory, so another tab's refresh can
still land after this tab logs out. Every current browser has Web Locks, which
close this gap.

## Session Reads: SSR vs Browser

| Read | SSR | Browser |
| --- | --- | --- |
| `useMeQuery` (`auth.me`) | `readServerSession()`: `serverApiGet` with forwarded cookie; no hint → `null` (anonymous); with the hint, any failure rejects, and a 404 is rewritten to `error_code: 401` (this query only) so it takes the 401 path | `AuthModel.getSession()` via axios → refresh-and-retry; a 401 or 404 after refresh (`isSessionGoneError`) → `revokeSession` (posts only while the hint is set and the session has not already ended), then `null`; 5xx and network errors surface as transient |
| `useUsersListQuery` | `serverApiPaginate`; failures reject | `UsersModel.list()` via axios → refresh-and-retry; errors surface |

`layouts/default.vue` resolves the session once per SSR request with
`useServerRenderedQuery(useMeQuery)`, before the header renders; `pages/login.vue`
reads that result instead of probing again. A 401 renders signed-out, is not
dehydrated, and the browser resolves it after hydration (refreshing if the access
cookie merely expired) instead of showing a stale "logged out". Any other failure
is rendered and dehydrated as that error, so the retry banner shows on both sides.
No second probe runs on the server: a retry nobody awaits would settle after the
header was rendered and reach the payload — a hydration mismatch.
`pages/users.vue` resolves the users list the same way, so the server renders the
list or its error (a 401 renders loading and the browser refreshes). `serverApi*` helpers reject with an `ApiResponseError`
(`error_code` = HTTP status, `0` when unreachable; `retryable: true` for
unreachable, 408, 429 and 5xx) instead of returning `null`. SSR never calls
`/auth/refresh`. A 404 from `/auth/me` counts as signed out like a 401 (the
account is gone); the trade-off is that a 404 from a wrong `API_PREFIX` or
gateway signs the user out too. The session end also posts `/auth/logout`, which revokes the user's access tokens on every device (Redis on), so that misconfiguration can sign the user out elsewhere too. An `HMAC_ERROR` keeps the session and shows the
banner. Only a 401/404 ends the session on boot: a retryable failure keeps
the session and `layouts/default.vue` shows a `role="alert"` banner
(`session.unavailable`) with a Retry button (`session.retry`, `refetchSession()`);
the banner disappears once the retry succeeds. An anonymous visitor (no session hint cookie) resolves to signed-out without any
request, so an unreachable backend never shows the banner to them. A 401 (or a refused refresh) is the
normal signed-out flow and shows no banner. Covered by `layout-session-ssr.test.ts`.

## Per-Service Refresh Config

`ApiInterceptors` is built from a `Record<service, ServiceRefreshConfig>`. A
service is auto-refreshed **iff it appears in that map**; omit it to opt out (its
401s just reject). `ServiceRefreshConfig` = `Partial<{ endpoint, skipPaths,
hasSession, onRefreshed }>`. Defaults: `endpoint: "/auth/refresh"`,
`skipPaths: []`, `hasSession: hasSessionHint` (`01.init-services.ts` passes the
contract's paths and `onRefreshed: markSessionActive`). Managers are built
lazily and cached per service.

## End-to-End 401 Sequence (browser)

```
request (stamped _sentAt) → 401
   │
   ├─ canAttemptRefresh?  (not _retry, not exempt, session hint set)
   │        │ no → reject toApiError(error)
   │        │ yes
   ├─ config._retry = true
   ├─ RefreshTokenManager.refresh(_sentAt)   ← concurrent 401s share ONE call
   │        ├─ navigator.locks "<APP_NAME>:auth-refresh:<service>" (cross-tab)
   │        ├─ session ended meanwhile (epoch, logout, no hint)? → SessionEndedError
   │        ├─ cookies rotated since _sentAt (any tab)? → skip, just replay
   │        ├─ bare-axios POST /auth/refresh (refresh cookie + HMAC) → rotated cookies
   │        ├─ 401/403 → endSession("expired") → reset cache, /login; reject original 401
   │        └─ anything else → reject refreshUnavailable (retryable), session kept
   └─ replay request (fresh cookie) → original outcome propagates
```

## Mock auth (before backend integration)

`NUXT_PUBLIC_AUTH_MOCK=true` answers the template's built-in endpoints — auth
(`/auth/*`) and users (`/users`) — so pages can be built before the backend
exists. It is **off by default**; turn it off and the real backend is used with
no change to pages, stores or middleware.

```
NUXT_PUBLIC_AUTH_MOCK=true
# Optional — defaults: demo@example.com / password
# NUXT_PUBLIC_AUTH_MOCK_EMAIL=dev@example.com
# NUXT_PUBLIC_AUTH_MOCK_PASSWORD=s3cret-pass
```

Truthy is `"true"` or `"1"` (anything else, such as `yes` or `on`, is off).
Nuxt's env override parses `NUXT_PUBLIC_AUTH_MOCK=true` / `=1` into the boolean
`true` / number `1` in `runtimeConfig`, so those are accepted too; the same
parsing turns `TRUE` into `true`, so a differently-cased value is on here. They map to `runtimeConfig.public.authMock`,
`authMockEmail` and `authMockPassword` (declared in `nuxt.config.ts`), read once
at boot by `01.init-services.ts`. Implementation: `services/auth/data/mock-auth.ts`
(adapter), with `mock-auth-config.ts` (flag), `mock-auth-session.ts` (mock user
cookie) and `mock-auth-responses.ts` (backend-shaped replies), plus
`services/users/data/mock-users.ts` (the users fixture and handlers).

- **Seam.** `mockAuthAdapter` replaces only axios's network adapter, on
  `AuthModel`'s and `UsersModel`'s clients and on the bare refresh call
  (`auth-refresh-client.ts`). Requests still run the real interceptors, and
  answers use the backend's
  shapes: login/register/refresh/logout/me return the `{ success, data }`
  envelope, and a wrong password is the same 401
  (`{ error_code: 401, message: "Invalid email or password!" }`) the login form
  already shows. Any other API still calls the real backend.
- **Session.** Login sets the readable session hint cookie exactly as before, so
  the `auth` / `guest` middleware, cross-tab sync and logout are unchanged. The
  httpOnly token cookies need a backend, so the mock keeps the signed-in user in
  a readable `<APP>_MOCK_USER` cookie (7 days, like the hint). The browser sends
  it with page requests, so `readServerSession` resolves the user during SSR
  (no backend call) and a reload keeps the session. The mock `refresh` renews
  that cookie; with the cookie gone but the hint left, the SSR read rejects, the
  browser's read is refused and the session ends as "expired", like a real
  refused refresh.
- **Credentials.** One login pair, signed in as an `admin` so the built-in
  users page works. `register` signs up any user, who stays signed in but
  cannot log in again (no user store) and is a plain `user`.
- **Users.** `GET /users` (offset-paginated `?page&limit`, envelope
  `{ success: true, data, meta }`) and `GET /users/:id` answer from a fixed
  fixture: the demo user plus five sample users (`MOCK_SAMPLE_USERS`), newest
  first, no passwords. Checks run in the backend's order: no session is `401`
  ("Access token required!"), a role below `admin` is `403` ("Insufficient
  permissions!"), an unknown id is `404` ("User not found!"). Users registered
  in the mock session are not added to the list. Any unknown id is `404` here; the backend answers `400` for a malformed ObjectId. Other methods and paths fall
  through to the real backend. The browser reads go through the adapter; the
  SSR list fetch (`fetchUsersOnServer`, behind `!import.meta.env.PROD`) is
  answered from the request's `<APP>_MOCK_USER` cookie the same way, resolving
  the envelope or rejecting with the backend's error body, so the `/users` page
  renders server-side with no backend.
- **Signals.** One `console.warn` at boot and a "Mock auth" badge
  (`components/mock-auth-badge.vue`, rendered by `layouts/default.vue`), only
  while active.
- **Dev SSR trust.** With the flag on, the dev SSR server takes the readable
  `<APP>_MOCK_USER` cookie as the user's identity, with no signature or backend
  check: anyone who can reach it can forge a session. Run with the flag only on
  localhost, never on a shared, staging or tunnelled dev server.
- **Production guard.** In a production build (`import.meta.env.PROD`) the flag
  is ignored, even though `runtimeConfig` is read at runtime, with one
  `console.warn`; the mock adapter, the SSR branches and the users fixture are
  removed from the bundle. The badge component is imported only outside
  production, so its code is not in a production bundle at all.
- **Limits.** Endpoints beyond auth and users (and other SSR reads through
  `serverApiGet`) forward the `accessToken` cookie, which the mock never sets,
  so the backend sees a signed-out request: point them at a backend that
  accepts it, or mock them separately. The Socket.IO handshake relies on the
  httpOnly `accessToken` cookie, which the mock never sets, so the socket is
  refused. Tokens never expire, so expiry flows need a real backend.
