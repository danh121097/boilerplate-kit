# Security & Auth

The flagship subsystem. Auth is **cookie-first**: the backend sets an httpOnly
**access cookie** (15 min) and an httpOnly **refresh cookie** (scoped to the
backend's `/api/v1/auth` routes); no token ever touches JS. Every request carries
an optional **HMAC signature**. In the browser a 401 drives a **single-flight,
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

## HMAC Request Signing (`hmac-signature.ts`)

Active only when `runtimeConfig.public.hmacSecret` (`NUXT_PUBLIC_HMAC_SECRET`) is
set; otherwise signing is skipped. The secret is read via `useRuntimeConfig()`
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
  through a signed server route, or exempt the upload route on the backend.

Signed by the axios request interceptor (`HeadersUtils.setAuthHeaders`), the bare
refresh client, `serverApiGet` (SSR), and the Socket.IO handshake over
`GET /socket` (see [Networking & Realtime](./networking-realtime.md)).

> **Security note:** the browser must sign too, so the secret has to be in
> `runtimeConfig.public` — which is serialized into the page payload and readable
> by anyone. The client HMAC is therefore an **anti-casual-abuse** measure (it
> stops naive scripted calls and replays older than 5 minutes), **not**
> authentication. Authorization rests on the httpOnly cookies. Do **not** move the
> secret to a private (non-`public`) `runtimeConfig.hmacSecret`: the browser
> signer would then have no secret and every client request would fail HMAC
> verification. If the signature must be unforgeable, route browser traffic
> through a server-side proxy (Nitro route / BFF) that signs with a private
> secret, and point the browser at that proxy instead of the backend.

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
…)` listeners. Reasons are `"logout"` (voluntary, or another tab's) and
`"expired"` (a refused refresh).

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

### Logout vs an in-flight refresh

`AuthModel.logout`:

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
`syncAuthAcrossTabs({ onLogin })` (`services/core/session.ts`), which follows
two signals:

- the `<APP_NAME>_AUTH_SYNC` localStorage `storage` event — `startSession()`
  (login / register) broadcasts `login`, `endSession` broadcasts `logout` for
  the MAIN service;
- a hint re-read on window `focus` and `visibilitychange` (when visible),
  compared with the last value this tab wrote or saw — this also catches a hint
  that expired.

| Change | Effect |
| --- | --- |
| signed out elsewhere | this tab ends its session as `"logout"` (without re-broadcasting) — `resetQueriesOnSessionEnd` drops every query's data in place, session `null` |
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
| `useMeQuery` (`auth.me`) | `readServerSession()`: `serverApiGet` with forwarded cookie; a 401 without the hint → `null` (anonymous); a 401 with the hint, or any other failure, rejects | `AuthModel.getSession()` via axios → refresh-and-retry; a 401 after refresh → `null` (anonymous); other errors surface |
| `useUsersListQuery` | `serverApiPaginate`; failures reject | `UsersModel.list()` via axios → refresh-and-retry; errors surface |

Pages prefetch the session with `queryClient.prefetchQuery(...)`, which never
throws. A failed SSR probe is not dehydrated, so the browser resolves it on
hydration (refreshing if the access cookie merely expired) instead of rendering a
stale "logged out". `serverApi*` helpers reject with an `ApiResponseError`
(`error_code` = HTTP status, `0` when unreachable; `retryable: true` for
unreachable, 408, 429 and 5xx) instead of returning `null`. SSR never calls
`/auth/refresh`. Only a 401 ends the session on boot: a retryable failure keeps
the session and `layouts/default.vue` shows a banner with a Retry button
(`refetchSession()`).

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
