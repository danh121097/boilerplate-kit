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
header): for a request with a body, the pinned `Content-Type` (looked up
case-insensitively), or `application/json` when none is pinned; for a bodyless
request, an empty string — axios drops the header when there is no body. The
refresh client always sends a JSON body, so it signs `application/json`.

The signed path is `config.url` relative to the baseURL with any inline query
stripped (`url.split("?")[0]`); `params` are never signed — the backend verifies
`req.url.split("?")[0]`.

Signed with HMAC-SHA256, Base64-encoded → `sig` header. Also sends `ctime` and
`x-version` headers. Implemented in `HMACSignatureGenerator.generateSignature()`.

**This is anti-casual-abuse only, not a security boundary.** `EXPO_PUBLIC_*`
values are inlined into the JS bundle, so anyone with the app binary can extract
the secret and sign arbitrary requests. It raises the bar for scripted traffic
against the API; authorization must still be enforced server-side by the JWT.

The bare refresh client (`auth-refresh-client.ts`) signs its own request manually
(it bypasses the app interceptors to prevent refresh recursion).

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
refresh tokens.

## 401 handling

A 401 is routed in this order:
1. **Credential endpoints** (login, register, logout pass `skipAuthRefresh`):
   passed through untouched — no refresh, no token clear, no session-expired.
2. **Session ended after send**: the request interceptor stamps the session epoch
   on every request; if a clear (logout / expiry) happened since, the 401 rejects
   with `SessionClearedError` (`error_code: 401`, `message: "session_ended"`) and
   nothing else happens — no `/auth/refresh` call, no second clear, no expiry.
3. **Refresh + replay** when ALL are true: `config._retry` is not set (not already
   retried), the URL is not the refresh endpoint (no recursion), and a token
   exists for the service.
4. **Unrecoverable session** (token held, but already retried or no refresh config
   for the service): clear that service's tokens and fire `onSessionExpired`.
5. **Anonymous** (no token): passed through; it never expires a session.

## Refresh failure policy

| Refresh outcome | Tokens | Session | Error the caller sees |
|-----------------|--------|---------|-----------------------|
| 2xx with tokens | Rotated + saved | Continues | Replayed request's own result |
| **401 / 403** | Cleared | Expired → `onSessionExpired(service)` | `RefreshRejectedError` |
| Anything else: offline, timeout (15s), 429, 5xx, **any other 4xx** (400, 404, 422, ...), malformed body | **Kept** | Continues | `RefreshUnavailableError` (`retryable: true`, `error_code` = HTTP status or 0) |
| Session cleared (logout / re-login) while in flight — whatever the outcome, including a 401/403 | Not saved, not cleared | Newer session untouched | `SessionClearedError` (`error_code: 401`, `session_ended`) |

All three errors carry the `ApiResponseError` envelope fields (`status: "error"`,
`message`, `error_code`, `error_message`), so screens render them like any API error.

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

`AuthModel.logout()` revokes the **latest** refresh token:
1. It waits for any in-flight refresh (`RefreshTokenManager.waitForPendingRefresh`,
   re-checked in a loop) so it never revokes a token that refresh is rotating
   away — the rotated one would otherwise stay valid on the server. The total
   wait is capped at `LOGOUT_REFRESH_WAIT_MS` (15s); after the cap, logout
   proceeds with whatever tokens are stored. If that refresh later rotates the
   pair server-side, the epoch guard drops its result locally, but the rotated
   refresh token stays valid on the server until it expires (accepted limit).
2. It reads the refresh token **and** the access token together (one
   `Promise.all`), then — synchronously after the last check — clears every
   stored token, bumping the epoch. With no access token left, no new refresh can
   start, and any 401 for a request sent before the clear rejects as
   `session_ended` without calling `/auth/refresh`.
3. It posts `{ refreshToken }` to `/auth/logout` (body — no cookie jar in RN) with
   `Authorization: Bearer <access token read in step 2>`, only when one was held.
   The request interceptor never overrides a caller-set `Authorization` (after the
   clear it has nothing to attach anyway). The request carries `skipAuthRefresh`,
   so a 401 from logout never refreshes, clears or fires session-expired.

Tokens are cleared even if the request fails. The auth store also calls
`queryClient.clear()` and resets its state. A voluntary logout never fires
`onSessionExpired` and never adds a `returnTo`.

Refresh coordination is in memory only (single app process — no cross-tab case),
so it uses no storage keys. Every SecureStore key comes from `STORAGE_KEYS` or
the exported, sanitized `APP_PREFIX`.

**Epoch guard:** every token clear (`clearServiceTokens` / `clearAuthTokens`,
the only clear helpers) bumps an in-memory per-service session epoch. Work that
started before the clear sees a different epoch when it finishes and discards
its result:
- a refresh never re-saves tokens, and a stale 401/403 never clears or expires a
  newer login's session;
- `loadUser()` (getMe) never re-sets `user` / `isAuthenticated` after logout.

If a clear lands during the refresh's token write itself, the just-written values
are rolled back (compare-and-delete).

## Hard logout (session expired)

When an authenticated 401 cannot be refreshed (no refresh config, already retried) or
the refresh endpoint rejects with 401/403, the service's tokens are cleared and
the injected `onSessionExpired()` callback (registered in `initServices`) fires.
The root layout's handler is idempotent: it clears the TanStack Query cache and
calls `useAuthStore.expireSession()` (`isAuthenticated: false`,
`sessionExpired: true`). It does not navigate itself: the `(app)` gate reacts
and redirects to `/login?returnTo=<current path>` (`usePathname()`), so there is
a single navigation. No `window.location.reload()`.

After sign-in, the login screen and the `(auth)` gate both go to
`safeReturnPath(returnTo)` — only in-app paths: at most 512 chars, a single
leading `/` (no `//host`, no `/\host`), no backslash anywhere, no control
characters (`\u0000`–`\u001F`, `\u007F`), no `://`, and not `/login` (with or
without a query, trailing slash or subpath); anything else goes to `/`.
A voluntary logout redirects to a plain `/login` (no return path). Only the path
is kept; the stack history before the expiry is not restored.

## Boot hydration

`useAuthStore.hydrate()` reads the stored access token and calls `getMe`:
- success → authenticated with `user`;
- session-ending failure (tokens cleared by a rejected refresh, or `error_code`
  401) → logged out;
- any other failure (offline, 5xx, 429, timeout) with tokens still stored →
  **stays authenticated with `user: null`**. `loadUser()` retries; the profile
  screen calls it when it opens authenticated without a user (never after logout).
