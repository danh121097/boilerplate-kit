# Security & Auth

The flagship subsystem. A **JWT access token** (bearer header) and a **refresh
token** (sent in the refresh/logout body) live in per-service localStorage slots;
every request carries an optional **HMAC signature**. A 401 drives a
**single-flight, cross-tab-locked** refresh-and-replay per service. The service
layer never reloads the page: an unrecoverable session fires a "session expired"
event the app turns into a redirect to `/login`.

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
clearServiceTokens(service)   // drop ONE service's pair (failed refresh, unrecoverable 401)
clearAuthTokens()             // drop EVERY registered service's pair (logout)
onTokensChanged(listener)     // localStorage is not reactive — writers notify here
```

The auth store mirrors token presence into a `hasToken` ref through
`onTokensChanged`, so `isAuthenticated` updates on login, refresh, logout and
interceptor-driven clears. It also listens to the `window` `storage` event. When
another tab logs out, this tab drops its profile and every query's data
(`resetQueriesToSignedOut`, see below), and the guard state (`hasToken`)
follows. When another tab logs in, this tab resets its profile, marks every
query stale (`resyncQueriesAfterLogin`, so mounted views refetch) and re-reads
the profile.
A token rotation elsewhere, where presence is unchanged, is ignored.

`clearServiceTokens` / `clearAuthTokens` bump a per-service **session epoch**
(`getSessionEpoch`). A refresh captures it before its network call and persists
nothing if it changed meanwhile — see [Logout vs an in-flight refresh](#logout-vs-an-in-flight-refresh).

## HMAC Request Signing (`hmac-signature.ts`)

Active only when `VITE_HMAC_SECRET` is set; otherwise `generateSignature` returns
`null` and signing is skipped entirely.

```ts
const path = normalizeUrl(config.url || "");                 // ensure leading "/"
const method = config.method?.toUpperCase() || "";
const hasBody = config.data !== undefined && config.data !== null;
// The backend signs the raw Content-Type header it receives. axios drops it on
// bodyless requests → ""; a request with a body sends its pinned type.
const contentType = hasBody ? pinnedContentType || "application/json" : "";
const stringToSign = [method, contentType, ctime, path, ""].join("\n");  // canonical
const sig = Base64.stringify(HmacSHA256(stringToSign, secret));          // base64 HMAC-SHA256
return { sig, ctime, "x-version": xVersion };                            // headers
```

- **Canonical string:** `[method, contentType, ctime, path, ""].join("\n")` — the
  trailing `""` yields a final newline. `contentType` MUST equal the header the
  request actually sends.
- **Algorithm:** HMAC-SHA256, base64-encoded (`crypto-js`).
- **Headers attached:** `sig`, `ctime`, and `x-version` (`VITE_BUILD_VERSION` or
  `1.0.0`). The server recomputes the signature and compares.

**Signing rules and limits** (the backends verify the raw `Content-Type` header
and the path with the query stripped):

- The signed path is `config.url` (relative to the baseURL) with the query
  stripped (`url.split("?")[0]`). Query params — inline or via `params` — are
  never signed.
- The signed `contentType` is the exact header sent: the pinned value (or
  `application/json`) for a request with a body, `""` without one.
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
if (config._retry) return false;                        // already replayed once
if (isCredentialRequest(config, options)) return false; // refresh / login / register / logout
return Boolean(getAccessToken(options.service));        // skip anonymous traffic
```

So: never loop (`_retry` guard), never refresh a **credential endpoint** (a 401
from login means a wrong password, not an expired session — the error reaches
the form untouched), never trigger a refresh storm for anonymous requests.
Credential paths come from `excludePaths` (defaults `/auth/login`,
`/auth/register`, `/auth/logout`; `init-services.ts` passes the auth contract's
paths) plus the refresh `endpoint` itself.

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

`staleToken` is the bearer the failed request was sent with. When
`navigator.locks` is unavailable it falls back to the unlocked single-flight
behavior.

Failure handling distinguishes **definitive** from **transient** failures:

| Refresh outcome | Tokens | Effect |
| --- | --- | --- |
| 401/403 (revoked, reuse detected, expired) or malformed response | cleared | `onRefreshFailed` → `notifySessionExpired(service)` |
| Network error, timeout (15s), 408/429, 5xx | kept | rejects with `retryable: true`; a later request can refresh again |

Every rejection reaching a caller has the shape
`{ error_code: <HTTP status or 0>, message, retryable? }` (`toApiError`).

### The Refresh Call — `auth-refresh-client.ts`

Runs on a **bare axios instance**, NOT the app client, so a 401 from the refresh
request can never recurse back into the refresh interceptor. It must re-attach
HMAC headers itself, signing the same body and `Content-Type` it sends:

```ts
const body = { refreshToken: getRefreshToken(service) ?? undefined };
const signature = HMACSignatureGenerator.generateSignature({ url: endpoint, method: "post", headers, data: body });
const { data } = await axios.post(url, body, { withCredentials: true, headers });
// rotated pair (tolerates several envelope shapes) — the manager persists it,
// unless the session ended while the call was in flight
return { accessToken: extractAccessToken(data), refreshToken: extractRefreshToken(data) };
```

### Replay — `refreshAndRetry`

```ts
config._retry = true;                                  // mark before replaying
return ctx.manager.getFreshToken(sentAccessToken(config)).then(
  (token) => { config.headers.authorization = `Bearer ${token}`; return instance(config); },
  (error) => Promise.reject(toApiError(error)),        // refresh failed → reject, never reload
);
```

The replay's own outcome propagates: a later non-auth failure (e.g. 500) does
**not** wrongly clear the freshly minted token.

### When Refresh Is Not Possible — `handleUnauthorized`

```ts
if (ctx && isCredentialRequest(config, ctx.options)) return; // wrong password: leave session alone
const hadSession = Boolean(getAccessToken(service));
clearServiceTokens(service);                                 // drop only this service's pair
if (ctx && hadSession) notifySessionExpired(service);        // e.g. refreshed replay still 401
```

A service **without** refresh config just clears its tokens and rejects. Nothing
in the service layer reloads the page.

## Session Expiry → `/login`

`services/core/session-events.ts` is a tiny pub/sub. `plugins/session-expiry.ts`
subscribes once (after Pinia + router are installed): for the MAIN service it
calls `authStore.clearSession()` (user, tokens, and
`resetQueriesToSignedOut` (`services/core/query-client.ts`): every query reset in place — no refetch, in-flight fetches cancelled — unobserved ones removed, `auth.me` pinned to `null`. Never `queryClient.clear()`, which would leave mounted views attached to dead queries showing the old user's data) and
`router.replace({ name: "login", query: { redirect } })`.

## Boot Hydration and Logout (`stores/auth.ts`)

- `hydrate()` resolves the profile when a token exists. It clears the session
  **only** on a 401 (after the refresh attempt) or when a refused refresh already
  cleared the tokens. A network error, timeout or 5xx keeps the tokens and sets
  `hydrateError` (`retryable: true`); `App.vue` shows it with a Retry button
  (`retryHydrate()`).
- `logout()` posts `{ refreshToken }` to `/auth/logout` (so the backend revokes
  it), then clears tokens, user and every query's data — even if the request
  fails.
- The login view follows `?redirect=` after signing in, and the router guard
  (`router/auth-guard.ts`) does the same when a signed-in user opens `/login`.
  Both go through `safeRedirect(value)` (`utils/safe-redirect.ts`), which keeps
  the value only when it is a string of at most 512 chars, starts with exactly
  one `/`, contains no `\`, no control character (`[\u0000-\u001F\u007F]`, which
  URL parsers strip) and no `://`, and is not the login page itself (`/login`,
  `/login/`, `/login?…`, `/login#…`; `/login/callback` is allowed); otherwise `/`.
  The view shows the server's error message (`getApiErrorMessage`) on failure.

### Logout vs an in-flight refresh

`AuthModel.logout` marks a logout as running (`const done = beginLogout(service)`,
a counter, so overlapping logouts never clear each other's flag) in its first
tick, then runs through `withSessionLock(service, …)`: under the same
`<APP_PREFIX>:auth-refresh:<service>` Web Lock as the refresh (or, without `navigator.locks`,
after this tab's in-flight refresh settles). The wait is capped at 15s
(`SESSION_LOCK_WAIT_MS`); past it logout proceeds unlocked. A running refresh therefore finishes
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
`/auth/refresh`. Once the lock is held, in one synchronous tick it captures the
refresh token and the access token and bumps the session epoch (`bumpSessionEpoch`). It then posts
`{ refreshToken }` with `Authorization: Bearer <captured access token>`. So the
server cannot rotate the token logout is revoking. Tokens, user and query cache
are cleared even when the request fails; a voluntary logout never fires session
expiry and navigates to `/login` without a `redirect`. The `done()` returned by
`beginLogout` lifts the block afterwards (idempotent).

**Known limit:** two tabs **without** `navigator.locks`. The session epoch and the
logout-in-progress flag live in each tab's memory, so another tab's refresh can
still land after this tab logs out. Every current browser has Web Locks, which
close this gap.

## Per-Service Refresh Config

`ApiInterceptors` is built from a `Record<service, ServiceRefreshConfig>`. A
service is auto-refreshed **iff it appears in that map**; omit it to opt out (its
401s just clear that service's tokens). Defaults: `endpoint: "/auth/refresh"`,
`excludePaths: ["/auth/login", "/auth/register", "/auth/logout"]`. Managers are
built lazily and cached per service.

## End-to-End 401 Sequence

```
request → 401
   │
   ├─ canAttemptRefresh?  (not _retry, not a credential path, token present)
   │        │ no → credential path: reject as-is
   │        │      otherwise: clear service tokens; expire session if one was held
   │        │ yes
   ├─ RefreshTokenManager.getFreshToken(sentToken)  ← concurrent 401s share ONE call
   │        ├─ navigator.locks "<APP_PREFIX>:auth-refresh:<service>" (cross-tab)
   │        ├─ token already rotated by another tab? → use it
   │        ├─ bare-axios POST /auth/refresh ({ refreshToken } + HMAC) → new pair
   │        └─ definitive failure → clear tokens, notifySessionExpired → /login
   ├─ config._retry = true
   └─ replay request with `Bearer <newToken>` → original outcome propagates
```
