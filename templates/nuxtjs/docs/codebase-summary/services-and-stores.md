# Services & Stores

How the HTTP layer, domain services, Pinia stores, and the Socket.IO composable
fit together. Everything is **SSR-aware**: storage access no-ops on the server,
and secrets are read via `useRuntimeConfig()` inside a request scope.

## The axios layer (`app/services/core/`)

### `Api` (`api.ts`)

Shared HTTP client class. Each instance targets a logical `ApiService` (default
`"MAIN"`) and lazily resolves its `baseURL` via a static registry. Static
methods are the wiring points called once at startup:

- `Api.setBaseURL(url, service)` / `Api.getBaseURL(service)` — per-service base URLs.
- `Api.registerInterceptors(setup)` — register the request/response interceptor pair.

Instances are created with `withCredentials: true` (so the httpOnly refresh
cookie rides along), a 30 s timeout, and JSON headers. Interceptors are applied
lazily on first request (`ensureInterceptors`). Public methods: `get/post/put/
patch/delete/postFormData`, all taking an `ApiRequestConfig` (`customHeaders`
merge supported).

### `Model` (`model.ts`)

Base class for domain services. Subclasses call `Model.setup({ path, service })`
in a static block to bind an `Api` instance + path. See `AuthModel`, `UsersModel`.

### Session (`session.ts`) + app prefix (`app-prefix.ts`)

Auth tokens are httpOnly cookies — nothing auth-related is stored by JS. The
readable `<APP_NAME>_SESSION=1` cookie only says "a session is believed to exist"
(set on login / register / refresh, cleared when the session ends; never used
for authorization). `session.ts` holds:

- the hint: `hasSessionHint()` (browser `document.cookie`; SSR delegates to
  `hasServerSessionHint()` in `server-api.ts`), `markSessionActive()`,
  `clearSessionHint()` (no epoch bump), `startSession()` (mark + broadcast
  `login` to other tabs);
- a per-service session epoch and logout-pending counter (`getSessionEpoch`,
  `bumpSessionEpoch`, `isLogoutPending`, `beginLogout`): a refresh that lands
  after logout sees the epoch moved and does not re-mark the session;
- session end: `onSessionEnded(listener)`, `endSession(reason, service)` —
  bumps the epoch, and for MAIN clears the hint and broadcasts `logout`
  (`<APP_NAME>_AUTH_SYNC`), then notifies listeners;
- `syncAuthAcrossTabs`, `redirectOnSessionExpired`, `loginPathWithReturn`,
  `safeRedirect`.

`setAppPrefix()` (called by `01.init-services.ts` with `NUXT_PUBLIC_APP_NAME`)
prefixes the hint cookie, the auth-sync key, the refresh Web Lock and its
localStorage timestamp.

### HMAC signing (`hmac-signature.ts`) — via runtimeConfig

`HMACSignatureGenerator.generateSignature(config)` — `signRequest` with the
Content-Type `resolveContentType(config)` says axios will send — reads
`useRuntimeConfig().public.hmacSecret` (wrapped in try/catch — returns `null`
outside a request scope or when no secret). It signs
`[method, contentType, ctime, path, ""].join("\n")` with HMAC-SHA256 (base64),
returning `{ sig, ctime, "x-version" }` (version from `public.buildVersion`).
Because the browser signs too, the secret must stay `public` and reaches every
client — treat it as anti-casual-abuse, not authentication. Moving it to a
private `runtimeConfig.hmacSecret` would break browser signing; for an
unforgeable signature, proxy browser traffic through a server route that signs.

### Headers (`headers-utils.ts`)

`HeadersUtils.setAuthHeaders` attaches HMAC headers when a secret is set. There
is no Authorization header: auth rides on the httpOnly cookies
(`withCredentials`).

### Refresh flow (`interceptors.ts`, `refresh-token-manager.ts`, `auth-refresh-client.ts`)

- **Request interceptor** tags `config.serviceType` and `_sentAt`, adds HMAC headers.
- **Response interceptor** unwraps recognized envelopes (`{ status }` or
  `{ success }`), unwraps `Blob` responses, and on **401** (HTTP status or
  `error_code: 401`) attempts a refresh-and-replay when eligible
  (`canAttemptRefresh`: not already retried, not the refresh endpoint or a
  `skipPaths` entry — login/register/logout 401s are never refreshed — and
  `hasSession()` (default `hasSessionHint`) is true, so anonymous 401s never
  call refresh). It never reloads the page; rejections are normalized by
  `toApiError` (`api-errors.ts`). A refused refresh rejects with the original
  401; any other refresh failure with `refreshUnavailable` (retryable, session
  kept); a replay that is 401 again just rejects.
  `ApiInterceptors.refreshSession(service, sentAt?)` runs the same refresh on
  demand.
- **`RefreshTokenManager`** serializes refreshes per service: a burst of
  concurrent 401s yields exactly **one** network refresh (single-flight
  `inFlight` promise), run under a cross-tab `navigator.locks` lock and skipped
  when another tab rotated the cookies after the request was sent. A refused
  refresh (401/403, `isRefreshRefused`) calls `endSession("expired", service)`
  → `04.session-expiry.client.ts` resets the query cache and routes to
  `/login?redirect=…`. `withSessionLock` (capped at `SESSION_WAIT_TIMEOUT_MS`)
  keeps logout from overlapping a refresh.
- **`createTokenRefresher`** hits `/auth/refresh` on a **bare** axios instance
  (NOT the app client, to avoid refresh recursion) with `withCredentials` so the
  httpOnly refresh cookie is sent; it re-attaches HMAC headers manually
  (`signRequest`, empty Content-Type for the bodyless call). The backend rotates
  the cookies, so the refresher resolves with no value.

### TanStack helpers (`tanstack.ts`)

`defineQuery({ key, fetcher, ... })` and `defineMutation({ key, mutator,
invalidates, ... })` produce typed, reusable query/mutation definitions with
reactive keys and automatic `invalidateQueries` on mutation success. Errors are
typed as `ApiResponseError`.

### Types (`types.ts`)

`ApiService`, `ApiResponse`/`ApiResponseError`, `RefreshOptions`,
`ServiceRefreshConfig`, `ServiceConfig`, `HMACSignatureData`, plus an axios
module augmentation adding `serviceType`, `_retry` and `_sentAt` to the request
config. `RefreshOptions` = `{ endpoint, service, skipPaths, hasSession,
onRefreshed? }`.

## Domain services

### Auth (`app/services/auth/auth.ts`)

`AuthModel extends Model` (path `/auth`). Methods: `login`, `register` (both
call `startSession()`), `logout` (runs under the refresh lock via
`withSessionLock`, so it never overlaps a refresh, and always ends the session
with `endSession("logout")`), `revokeSession` (`Promise<boolean>`; browser-only,
revokes a server-rejected session and ends it as `"expired"`, single-flight, no
request when it already ended), `getMe` (`Promise<AuthUser>`), `getSession`
(`Promise<AuthUser | null>`; a 401 → `revokeSession`, then `null`).
Cookie-first: the backend sets httpOnly access/refresh cookies, so there is no
client-side token persistence. The response interceptor already unwraps the
envelope, so each method reads `res.data` once. Exposes `useLoginMutation`,
`useRegisterMutation`, `useLogoutMutation`. The canonical session read is
`useMeQuery` (`defineQuery<AuthUser | null>` in `services/auth/session.ts`): its
fetcher runs `readServerSession()` on SSR (`serverApiGet` with the forwarded
cookie; never refreshes) and `AuthModel.getSession()` in the browser. Types in
`types/auth.ts` (`AuthUser`, `AuthTokens`, `LoginPayload`, `RegisterPayload`,
`AuthResult`) — note `refreshToken` is optional client-side (it lives in the cookie).

### Users (`app/services/users/users.ts`)

`UsersModel extends Model` (path `/users`) with `list(params?: PaginationParams)`
(resolves the `PaginatedResponse<User>` envelope: `{ data, meta }`), `get(id)` and
`update(id, payload)` (both resolve the unwrapped `User`), plus `useUsersListQuery`
(same envelope; key `users.list`). The users page reads `data.data` and shows
`users.empty` for an empty list. Types in `types/user.ts`.

## Bootstrap plugin (`app/plugins/01.init-services.ts`)

Runs on server + client (no `.client`/`.server` suffix). Reads
`useRuntimeConfig().public`, declares a `services` array (MAIN defaults to
`getApiBaseUrl() (appEndpoint + /api/v1)`, token slot `AUTH_TOKEN`, refresh `/auth/refresh`),
and for each: `Api.setBaseURL`, `registerServiceToken`, collects refresh config.
Finally `Api.registerInterceptors(new ApiInterceptors(refreshByService))`. Add a
row + `NUXT_PUBLIC_*` key to wire another authenticated backend. The REST base URL
is computed via `getApiBaseUrl()` which appends `/api/v1` to the `appEndpoint` origin.

## Stores (`app/stores/`)

Pinia setup stores (explicit import only — `pinia.storesDirs: []`):

- **`counter.ts`** — `count` ref + `increment/decrement/reset`.
- **`socket-io.ts`** — holds `{ socket, authenticated }` via `setSocketIO`.

## Socket.IO (`app/composables/useSocketIO.ts`)

`useSocketIO()` creates an `io()` connection scoped to the component tree.
SSR-safe: `io()` is lazy (no socket opens until `.connect()`) and
`onMounted(connectSocket)` only fires client-side. Auth payload is
`{ role, sig, ctime }` (the httpOnly cookie authenticates) —
`signHeader()` HMAC-signs `["GET","application/json",ctime,"/socket",""]` using
`runtimeConfig.public.hmacSecret`. Throttled reconnect, event handlers keyed off
`SOCKET_EVENT`, and `onScopeDispose` cleanup. Also exports `useIo()` (lazy
shared socket) and `useSocketEvent(event, cb)` (auto-cleanup subscription).

## Related

- [Directory Structure](./directory-structure.md)
- [Conventions](./conventions.md)
- [../system-architecture.md](../system-architecture.md)
