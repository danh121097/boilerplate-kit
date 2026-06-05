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

### Auth tokens (`auth-token-storage.ts`) — SSR-guarded

`localStorage` token registry. `isClient()` (`typeof window !== "undefined"`)
guards every read/write, so during SSR `getAuthToken()` returns `null` and
mutations silently no-op. Tokens are namespaced per service via a lazy
`TokenKeyResolver` (the slot depends on the runtime app prefix, only knowable in
a request scope). MAIN defaults to `useStorageKeys("AUTH_TOKEN")`; register more
with `registerServiceToken(service, resolver)`. Helpers: `getAuthToken`,
`persistAuthToken`, `clearAuthToken`, `clearAuthTokens`.

### HMAC signing (`hmac-signature.ts`) — via runtimeConfig

`HMACSignatureGenerator.generateSignature(config)` reads
`useRuntimeConfig().public.hmacSecret` (wrapped in try/catch — returns `null`
outside a request scope or when no secret). It signs
`[method, contentType, ctime, path, ""].join("\n")` with HMAC-SHA256 (base64),
returning `{ sig, ctime, "x-version" }` (version from `public.buildVersion`).
Because the secret is `public`, it reaches the browser — for production, sign in
a Nitro route and use a private `runtimeConfig.hmacSecret`.

### Headers (`headers-utils.ts`)

`HeadersUtils.setAuthHeaders` attaches HMAC headers when present;
`addAuthorizationHeader` attaches `Bearer <token>` from the service's slot.

### Refresh flow (`interceptors.ts`, `refresh-token-manager.ts`, `auth-refresh-client.ts`)

- **Request interceptor** tags `config.serviceType`, adds HMAC + Bearer headers.
- **Response interceptor** unwraps recognized envelopes (`{ status }` or
  `{ success }`), unwraps `Blob` responses, and on **401** (HTTP status or
  `error_code: 401`) attempts a refresh-and-replay when eligible
  (`canAttemptRefresh`: not already retried, not the refresh call, and a token
  exists for that service — anonymous traffic never triggers a refresh storm).
- **`RefreshTokenManager`** serializes refreshes per service: a burst of
  concurrent 401s yields exactly **one** network refresh (single-flight
  `inFlight` promise); all callers await it, then replay with the new token. On
  failure it clears the token and fires `onRefreshFailed` (page reload).
- **`createTokenRefresher`** hits `/auth/refresh` on a **bare** axios instance
  (NOT the app client, to avoid refresh recursion) with `withCredentials` so the
  httpOnly refresh cookie is sent; it re-attaches HMAC headers manually, and
  extracts the new access token from any of several envelope shapes.

### TanStack helpers (`tanstack.ts`)

`defineQuery({ key, fetcher, ... })` and `defineMutation({ key, mutator,
invalidates, ... })` produce typed, reusable query/mutation definitions with
reactive keys and automatic `invalidateQueries` on mutation success. Errors are
typed as `ApiResponseError`.

### Types (`types.ts`)

`ApiService`, `ApiResponse`/`ApiResponseError`, `RefreshOptions`,
`ServiceRefreshConfig`, `ServiceConfig`, `HMACSignatureData`, plus an axios
module augmentation adding `serviceType` and `_retry` to the request config.

## Domain services

### Auth (`app/services/auth/auth.ts`)

`AuthModel extends Model` (path `/auth`). Methods: `login`, `register` (both
persist the access token via `storeSession`), `logout` (clears all tokens),
`getMe`. The response interceptor already unwraps the envelope, so each method
reads `res.data` once. Exposes `useLoginMutation`, `useRegisterMutation`,
`useLogoutMutation`, `useMeQuery`. Types in `types/auth.ts`
(`AuthUser`, `AuthTokens`, `LoginPayload`, `RegisterPayload`, `AuthResult`) —
note `refreshToken` is optional client-side (it lives in the cookie).

### Users (`app/services/users/users.ts`)

`UsersModel extends Model` (path `/users`) with `list/get/update` and a
`useUsersListQuery`. Types in `types/user.ts`.

## Bootstrap plugin (`app/plugins/01.init-services.ts`)

Runs on server + client (no `.client`/`.server` suffix). Reads
`useRuntimeConfig().public`, declares a `services` array (MAIN defaults to
`apiBaseUrl || jsonplaceholder`, token slot `AUTH_TOKEN`, refresh `/auth/refresh`),
and for each: `Api.setBaseURL`, `registerServiceToken`, collects refresh config.
Finally `Api.registerInterceptors(new ApiInterceptors(refreshByService))`. Add a
row + `NUXT_PUBLIC_*` key to wire another authenticated backend.

## Stores (`app/stores/`)

Pinia setup stores (explicit import only — `pinia.storesDirs: []`):

- **`counter.ts`** — `count` ref + `increment/decrement/reset`.
- **`socket-io.ts`** — holds `{ socket, authenticated }` via `setSocketIO`.

## Socket.IO (`app/composables/useSocketIO.ts`)

`useSocketIO()` creates an `io()` connection scoped to the component tree.
SSR-safe: `io()` is lazy (no socket opens until `.connect()`), `getAuthToken()`
returns `null` on the server, and `onMounted(connectSocket)` only fires
client-side. Auth payload is `{ token: 'Bearer <token>', role, sig, ctime }` —
`signHeader()` HMAC-signs `["GET","application/json",ctime,"/socket",""]` using
`runtimeConfig.public.hmacSecret`. Throttled reconnect, event handlers keyed off
`SOCKET_EVENT`, and `onScopeDispose` cleanup. Also exports `useIo()` (lazy
shared socket) and `useSocketEvent(event, cb)` (auto-cleanup subscription).

## Related

- [Directory Structure](./directory-structure.md)
- [Conventions](./conventions.md)
- [../system-architecture.md](../system-architecture.md)
