# Security + Auth

## Token storage model

| Token | Where stored | Who manages |
|-------|-------------|-------------|
| Access token (JWT) | `expo-secure-store` (Keychain on iOS, Keystore on Android) | Client (`auth-token-storage.ts`) |
| Refresh token | `expo-secure-store` (same as above) | Client (rotated by backend on every refresh) |

**All token storage is async.** `SecureStore.getItemAsync()` returns a promise;
all reads and writes must await. The backend also sets httpOnly cookies, but a
React Native app has no reliable cookie jar, so this client sends the access token
as a `Bearer` header and the refresh token in the request **body** of
`/auth/refresh` and `/auth/logout`.

SecureStore keys must match `[A-Za-z0-9._-]`. The `EXPO_PUBLIC_APP_NAME` key
prefix is sanitized (`sanitizeStorageKeyPrefix`): any other character, spaces
included, becomes `_` (`"My App"` → `My_App_ACCESS_TOKEN`).

## HMAC request signing

Every request is signed when `EXPO_PUBLIC_HMAC_SECRET` is set.

Canonical string (identical to backend `verifyHmac`):
```
METHOD\n
Content-Type\n
ctime (ms epoch)\n
/path\n
(empty line)
```

The signed Content-Type is the one actually sent (the backend verifies the raw
header), computed by `resolveContentType(config)`:
- no body (`data === undefined`): an empty string — axios drops the header;
- a pinned `Content-Type` (looked up case-insensitively): sent as is;
- otherwise axios' default for the body: `URLSearchParams` →
  `application/x-www-form-urlencoded;charset=utf-8`, a string →
  `application/x-www-form-urlencoded`, anything else (including `null`) →
  `application/json`.

The refresh client always sends a JSON body, so it signs `application/json`.

The signed path is `config.url` relative to the baseURL with any inline query or
hash stripped (`url.split(/[?#]/)[0]`); `params` are never signed — the backend
verifies `req.url.split("?")[0]`.

Signed with HMAC-SHA256, Base64-encoded → `sig` header. Also sends `ctime` and
`x-version` headers. The pure signer is `HMACSignatureGenerator.signRequest({
method, path, contentType, ctime })`; the request interceptor uses the
`generateSignature(config)` adapter.

**This is anti-casual-abuse only, not a security boundary.** `EXPO_PUBLIC_*`
values are inlined into the JS bundle, so anyone with the app binary can extract
the secret and sign arbitrary requests. It raises the bar for scripted traffic
against the API; authorization must still be enforced server-side by the JWT.

The bare refresh client (`auth-refresh-client.ts`) signs its own request with
`signRequest` (it bypasses the app interceptors to prevent refresh recursion).

**Multipart is unsupported with HMAC on.** `postFormData` pins
`multipart/form-data`, but the header actually sent carries a boundary the signer
never sees, so the backend rejects the signature. Upload through an unsigned
route or sign on a server.

## Single-flight refresh

`RefreshTokenManager` serializes concurrent 401 refreshes for ONE service:

```
concurrent 401s → getFreshToken() → inFlight promise already exists → join it
                                  → no inFlight → read session epoch
                                                → POST /auth/refresh (15s timeout)
                                                → persist tokens if epoch unchanged
                                                → clear inFlight
```

A burst of N concurrent 401s triggers exactly ONE `POST /auth/refresh`. All N
callers await the same promise and retry with the new token. The refresher
(`createTokenRefresher`) only fetches; the manager persists the rotated access +
refresh tokens, then calls `onRefreshed`. When the stored access token already
differs from the one the failed request was sent with (an earlier refresh
rotated it), the manager returns the stored token without a network refresh.

Refresh is configured per service in `initServices()` as `RefreshOptions`
(`endpoint`, `skipPaths`, `hasSession`, `onRefreshed`); the auth service's
`skipPaths` are the login, register and logout endpoints.

## 401 handling

A 401 is routed in this order:
1. **No refresh for the service, the refresh endpoint or a `skipPaths` entry**
   (login, register, logout; matched on the path without `?query` / `#hash`):
   passed through untouched — no refresh, no token clear, no session-ended event.
2. **Session ended after send**: the request interceptor stamps the session epoch
   on every request; if the session ended since (logout, expiry, a new login),
   the 401 rejects with `SessionEndedError` (`error_code: 401`,
   `message: "session_ended"`) and nothing else happens — no `/auth/refresh`
   call, no clear, no event. The check runs again after every await of the 401
   handler (the `hasSession` SecureStore read, the refresh), so a logout that
   lands while the handler is reading tokens still wins.
3. **Anonymous** (`hasSession()` false — neither token stored) or **already
   replayed once** (`config._retry`): passed through. A replayed request that
   401s again does not end the session — only the refresh endpoint decides that.
4. Otherwise **refresh + replay** with the new token. A replay's own outcome
   (e.g. a later 500) propagates as is and never clears the refreshed token.

## Refresh failure policy

| Refresh outcome | Tokens | Session | Error the caller sees |
|-----------------|--------|---------|-----------------------|
| 2xx with tokens | Rotated + saved | Continues | Replayed request's own result |
| **401 / 403** (`isRefreshRefused`) | Cleared | Ended → `endSession("expired", service)` | The original 401 |
| Anything else: offline, timeout (15s), 429, 5xx, **any other 4xx** (400, 404, 422, ...), malformed body | **Kept** | Continues | `refreshUnavailable(error)`: `message: "refresh_unavailable"`, `retryable: true`, `error_code` = HTTP status or 0 |
| Session ended (logout / re-login) while in flight — whatever the outcome, including a 401/403 | Not saved, not cleared | Newer session untouched | `SessionEndedError` (`error_code: 401`, `session_ended`) |

Every error carries the `ApiResponseError` envelope fields (`status: "error"`,
`message`, `error_code`, `error_message`), so screens render them like any API
error. Only the refused refresh of a service ends that service's session: a
secondary backend's refused refresh never signs the user out of the app.

Only an explicit 401/403 from the refresh endpoint ends the session — a deliberate
decision: every other refresh failure, including other 4xx statuses, is treated
as retryable, because signing a user out is costlier than one more failed
request, and the backend signals a dead refresh token with 401. A transient
failure keeps both tokens, so the next 401 retries the refresh; `/auth/refresh`
is rate-limited on the backend, so do not retry it in a tight loop.

Rotation caveat: the backend rotates the refresh token with reuse detection. If
the server rotated but the response was lost (e.g. connection dropped after the
server committed), the client still holds the old refresh token; the next refresh
presents it, the backend treats it as reuse, revokes the family and answers 401 —
the user is signed out. This is by design on the server side.

## Logout

`AuthModel.logout()` is the user's own sign-out and the only `"logout"` session
end. It revokes the **latest** refresh token (the steps are shared with
`revokeSession`, below, through one private helper that takes the end reason):
0. It marks a logout as pending (`beginLogout`) synchronously, before any
   await: from then on no refresh starts or is joined, and a 401 rejects as
   `session_ended` without calling `/auth/refresh`.
1. It runs inside `withSessionLock(service, …)`, which waits for any in-flight
   refresh (re-checked in a loop) so it never revokes a token that refresh is
   rotating away — the rotated one would otherwise stay valid on the server. The
   wait is capped at `SESSION_WAIT_TIMEOUT_MS` (15s); after the cap, logout
   proceeds with whatever tokens are stored. If that refresh later rotates the
   pair server-side, the epoch guard drops its result locally, but the rotated
   refresh token stays valid on the server until it expires (accepted limit).
   A single JS context has no tabs, so there is no cross-context lock.
2. It reads the refresh token **and** the access token again, preferring what
   is stored now (a rotated pair) and falling back to the pair it started
   reading when logout began (those reads are kicked off before the wait, since
   SecureStore is async) if storage is empty by then. It then bumps the session
   epoch: every request sent before now that 401s rejects as `session_ended`.
3. It posts `{ refreshToken }` to `/auth/logout` (body — no cookie jar in RN) with
   `Authorization: Bearer <access token read in step 2>`, only when one was held.
   The request interceptor never overrides a caller-set `Authorization`. The
   logout path is in the auth service's `skipPaths`, so a 401 from logout never
   refreshes, clears or ends the session.
4. Whatever the response, it clears every stored token and calls
   `endSession("logout", service)`.

The auth store then calls `resetQueriesToSignedOut(queryClient,
queryKeys.auth.me)` — every cached query is reset and the session query is
pinned to `null` (signed out), unlike `queryClient.clear()`, which would leave
mounted observers on orphaned queries — and resets its state. A voluntary logout
is a `"logout"` session end: it never adds a
`redirect` (it sets `loggedOut`, so the gate goes to a plain `/login`).

Refresh coordination is in memory only (single app process — no cross-tab case),
so it uses no storage keys. Every SecureStore key comes from `STORAGE_KEYS` or
the sanitized app prefix (`getAppPrefix()`).

**Epoch guard:** every token clear (`clearServiceTokens`, `clearAuthTokens`,
`clearAccessToken`, `clearRefreshToken`) and every `endSession` bumps an
in-memory per-service session epoch (`session.ts`). Work that
started before the clear sees a different epoch when it finishes and discards
its result:
- a refresh never re-saves tokens, and a stale 401/403 never clears or expires a
  newer login's session;
- `loadUser()` (getMe) never re-sets `user` / `isAuthenticated` after logout.

If a clear lands during the refresh's token write itself, the just-written values
are rolled back (compare-and-delete).

## Route guards

- A guest on a protected route is sent to `/login?redirect=<original path>`.
- A signed-in user on the guest-only login screen is sent to the validated return
  path (in-app paths only, `safeReturnPath`), else home.
- The decision uses the synchronous session signal (the auth store's
  `isAuthenticated`, restored from SecureStore at boot) before any profile fetch.
  There is no SSR. A guest arriving by deep link at boot goes to
  `/login?redirect=<path>` once hydration finishes.
- Own explicit logout goes to plain `/login`; an involuntary sign-out (expired
  session) goes to `/login?redirect=<current path>`.

Implementation: the `(app)` gate (`app/(app)/_layout.tsx`) and the `(auth)` gate
(`app/(auth)/_layout.tsx`). The `redirect` value is the expo-router `pathname`, so
a query string on the protected screen is not carried (`usePathname()` drops it).
The `(auth)` gate clears `loggedOut` once a guest is on the login screen, so the
next protected screen opened as a guest gets a return path again.

## Hard logout (session expired)

Every session the server rejects ends as `"expired"`:
- the refresh endpoint refuses the refresh with 401/403: the refresh manager
  clears the service's tokens and calls `endSession("expired", service)`;
- the session query (`getMe`) itself gets a 401 — at boot, or on the profile
  screen's retry mid-session: `loadUser()` calls `AuthModel.revokeSession()`.

`revokeSession(sinceEpoch?)` runs the logout steps above (early token capture,
lock, epoch bump, best-effort `POST /auth/logout`, clear) but ends with
`endSession("expired", service)` and resolves `true`. `sinceEpoch` is the epoch
the caller read before its request (`loadUser` passes the one it read before
`getMe`). The revoke **backs out** — resolves `false`, posts nothing, ends
nothing — when the session already ended:
- the epoch moved since `sinceEpoch` (checked before joining an in-flight
  revoke), or a logout is already running;
- re-checked once the lock is held, since a refresh the revoke waited for may
  have been refused and ended the session meanwhile: the epoch moved (since
  `sinceEpoch`, else since the call started) or no token is stored.

The store then only resets its state. Concurrent callers share one in-flight
revoke (one POST, one event). A `logout()` called during it awaits that revoke
and posts nothing; if the revoke backed out, logout then signs out normally (one
POST, ended as `"logout"`). Logout itself never backs out. Overlapping
`loadUser()` calls of the same session share one `getMe`. When the revoke ended
the session, `loadUser()` signs the store out without `loggedOut`, so a boot 401
(not yet authenticated) also gets a `redirect`.

`endSession` notifies `onSessionEnded` listeners. The root layout subscribes
`watchSessionEnd()` (in `stores/auth.ts`), which reacts only to the auth service: it resets every cached query to signed
out (`resetQueriesOnSessionEnd`) and, when the session expired while
authenticated, calls `useAuthStore.expireSession()` (`user: null`,
`isAuthenticated: false`) once. It does not navigate itself: the `(app)` gate
reacts and redirects to `/login?redirect=<current path>` (`usePathname()`), so
there is a single navigation. No `window.location.reload()`.

After sign-in, the login screen and the `(auth)` gate both go to
`safeReturnPath(redirect)` (from `@/services/core`) — only in-app paths: at most
512 chars, a single
leading `/` (no `//host`, no `/\host`), no backslash anywhere, no control
characters (`\u0000`–`\u001F`, `\u007F`), no `://`, and not `/login` (with or
without a query, trailing slash or subpath); anything else goes to `/`.
A voluntary logout redirects to a plain `/login` (no return path). Only the path
is kept; the stack history before the expiry is not restored.

## Boot hydration

`useAuthStore.hydrate()` checks `hasStoredSession()` (an access **or** a refresh
token is stored) and calls `getMe`:
- success → authenticated with `user`;
- a 401 (the refresh was refused, or the session query itself was refused) →
  logged out; unless the session already ended, the store runs
  `AuthModel.revokeSession()` (revoke, clear, end as `"expired"`, `redirect`);
- any other failure (offline, 5xx, 429, timeout) with tokens still stored →
  **stays authenticated with `user: null`**. `loadUser()` retries; the profile
  screen calls it when it opens authenticated without a user (never after logout).

`useMeQuery` (a TanStack query on `queryKeys.auth.me`) fetches through
`AuthModel.getSession()`, which resolves `null` on a 401 instead of throwing, so
a signed-out session reads as `data: null`.

## Mock auth (before backend integration)

`EXPO_PUBLIC_AUTH_MOCK=true` answers the auth routes in the app so screens can be
built before the backend auth exists. It is **off by default**; turn it off and
the real backend is used with no change to screens, stores or guards.

```
EXPO_PUBLIC_AUTH_MOCK=true
# Optional — defaults: demo@example.com / password
# EXPO_PUBLIC_AUTH_MOCK_EMAIL=dev@example.com
# EXPO_PUBLIC_AUTH_MOCK_PASSWORD=s3cret-pass
```

Truthy is exactly `"true"` or `"1"` (anything else, e.g. `TRUE`, is off).
Restart Metro after changing an `EXPO_PUBLIC_*` value. The login form requires 8+
characters, so keep an overridden password that long. Implementation:
`services/auth/mock-auth.ts` (adapter), with `mock-auth-config.ts` (flag),
`mock-auth-session.ts` (tokens) and `mock-auth-responses.ts` (backend-shaped
replies).

- **Seam.** `mockAuthAdapter` replaces only axios's network adapter, on
  `AuthModel`'s client and on the bare refresh call (`auth-refresh-client.ts`).
  Requests still run the real interceptors, and answers use the backend's
  shapes: login/register/refresh/logout/me return the `{ success, data }`
  envelope, and a wrong password is the same 401
  (`{ error_code: 401, message: "Invalid email or password!" }`) the login form
  already shows. Every other API still calls the real backend.
- **Session.** Persisted exactly like the real mode: opaque
  `mock-access|…` / `mock-refresh|…` tokens go to the same SecureStore slots,
  so an app restart keeps the session, an invalid access token refreshes through
  the mock, and logout works. The token carries the user, so `me` and
  `refresh` need no server state.
- **Credentials.** One login pair. `register` signs up any user, who stays
  signed in but cannot log in again (no user store).
- **Signals.** One `console.warn` at boot (`initServices`) and a "Mock auth"
  badge in `app/_layout.tsx` (`components/mock-auth-badge.tsx`), only while active.
- **Production guard.** In a production build (`!__DEV__`) the flag is ignored,
  with one `console.warn`, and the mock adapter is `undefined` (the auth client
  uses axios's network adapter); the badge is gated on it too, so it never renders.
- **Limits.** Protected non-auth endpoints on the real backend still reject a
  mock token (401): point them at a backend that accepts it, or mock them
  separately. The Socket.IO handshake sends the mock token and is refused the
  same way. Tokens never expire, so expiry flows need a real backend.
