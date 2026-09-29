# Services & Stores

How server state, HTTP, auth, realtime, and client state fit together.

## Service Layer (`src/services/`)

### `Api` — the HTTP client (`core/api.ts`)

A wrapper over an axios instance with multi-service support. Each instance is
created with a `path` and a `service` name (default `"MAIN"`). Base URLs are
resolved lazily per service, and interceptors are applied once on first call.

```ts
this.http = axios.create({
  headers: { "Content-Type": "application/json", Accept: "*/*" },
  withCredentials: true,   // browser attaches the httpOnly refresh cookie
  timeout: 30_000,
});
```

Static registry methods: `Api.setBaseURL(url, service)`, `Api.getBaseURL(service)`,
`Api.registerInterceptors(...)`. Instance verbs: `get/post/put/patch/delete`
plus `postFormData` (sets `multipart/form-data`). All take an
`ApiRequestConfig` (`core/types.ts`).

### `Model` — base for domain models (`core/model.ts`)

Subclass and call `Model.setup({ path, service })` to bind a domain to its own
`Api` instance with the right base URL + interceptors. Models are wired at
startup via `initServices()`.

### Core utilities (`core/`)

| File | Role |
| --- | --- |
| `interceptors.ts` | `ApiInterceptors`: request (attach HMAC + Bearer + `serviceType`) and response (unwrap envelopes, drive 401 refresh/retry; credential endpoints never refresh; never reloads) |
| `refresh-token-manager.ts` | `RefreshTokenManager`: single-flight refresh per service under a cross-tab `navigator.locks` lock; skips the refresh when another tab already rotated the token; `withSessionLock` (capped at `SESSION_WAIT_TIMEOUT_MS`) keeps logout from overlapping a refresh |
| `session.ts` | Per-service session epoch + logout-pending (`getSessionEpoch`, `bumpSessionEpoch`, `isLogoutPending`, `beginLogout`); session end (`onSessionEnded`, `endSession(reason, service)`); `hasStoredSession`; cross-tab `syncAuthAcrossTabs`; `redirectOnSessionExpired`, `loginPathWithReturn`, `safeRedirect` |
| `api-errors.ts` | `toApiError` (normalize rejections, HTTP status in `error_code`), `isTransientHttpError`, `isUnauthorizedError`, `isRefreshRefused` (401/403 from the refresh call), `refreshUnavailable`, `getApiErrorMessage`, `SessionEndedError` |
| `app-prefix.ts` | `getAppPrefix()`: the app prefix for storage keys and lock names |
| `query-client.ts` | `resetQueriesToSignedOut`, `resetQueriesOnSessionEnd`, `resyncQueriesAfterLogin` |
| `auth-refresh-client.ts` | `createTokenRefresher()`: bare, interceptor-free call to the refresh endpoint (avoids refresh recursion); extracts new access token from common envelope shapes |
| `auth-token-storage.ts` | Per-service access + refresh token slots in `localStorage` (`get/persist/clear{Access,Refresh}Token`, `clearServiceTokens`, `clearAuthTokens`, `registerServiceToken`) + `onTokensChanged` for reactive mirrors |
| `headers-utils.ts` | `HeadersUtils`: attach HMAC signature headers + Bearer authorization header |
| `hmac-signature.ts` | `HMACSignatureGenerator` (`signRequest`, `generateSignature`) + `resolveContentType`: HMAC-SHA256 sign per request; **no-op unless `VITE_HMAC_SECRET` is set** |
| `tanstack.ts` | `defineQuery()` / `defineMutation()` factories typed against `ApiResponseError` |
| `types.ts` | Shared types (`ApiService`, `ApiResponse`, `ApiResponseError`, `RefreshOptions`, …) + axios module augmentation (`serviceType`, `_retry`) |

### `init-services.ts`

Single place to declare every backend. Each row wires a base URL, the token
storage slot, and (optionally) a refresh endpoint. Rows with an empty base URL
are skipped; presence of `refresh` enables per-service auto-refresh.

```ts
const SERVICES: ServiceDefinition[] = [
  { name: "MAIN",
    baseURL: getApiBaseUrl(), // VITE_APP_ENDPOINT + /api/v1
    tokenKey: STORAGE_KEYS.AUTH_TOKEN,
    refresh: { endpoint: "/auth/refresh", skipPaths: ["/auth/login", "/auth/register", "/auth/logout"] } },
];
```

### Auth & Users services

- `auth/auth.ts` — `AuthModel` (`/auth`): `login`, `register`, `logout`,
  `isLoggingOut` (true only while this tab's `logout` ends the session),
  `revokeSession` (`Promise<boolean>`; a server-rejected session is revoked and
  ended as `"expired"`, single-flight, no request when it already ended),
  `getMe` (`Promise<AuthUser>`), `getSession` (`Promise<AuthUser | null>`; a
  401 → `revokeSession`, then `null`); persists both tokens on login/register; `logout` runs under the
  refresh lock (`withSessionLock` — never overlaps a refresh), sends the latest
  `{ refreshToken }` so the backend revokes it, then clears all tokens and
  calls `endSession("logout", service)`. Exposes `useLoginMutation`,
  `useRegisterMutation`, `useLogoutMutation`, `useMeQuery`
  (`defineQuery<AuthUser | null>` over `getSession`). Types in
  `auth/types/auth.ts`.
- `users/users.ts` — `UsersModel` (`/users`): `list(params?: PaginationParams)`
  returns `PaginatedResponse<User>` (`{ status, data, meta }`, read through
  `Api.paginate`); `get` and `update` return the unwrapped `User`. Exposes
  `useUsersListQuery` (same paginated shape, key `users.list`). Pages read
  `data.data` and show `users.empty` for an empty list. Types in
  `users/types/user.ts`; pagination types (`OffsetMeta`, `CursorMeta`,
  `PaginatedResponse`, `CursorResponse`, `PaginationParams`, `CursorParams`) in
  `core/types.ts`, with `Api.paginate` / `Api.cursorPaginate` in `core/api.ts`.

Models read responses as already-unwrapped payloads because the response
interceptor strips a recognized envelope (`{ status: "success" }` or
`{ success: true }`).

## Pinia Stores (`src/stores/`)

Setup-style stores. Imported explicitly — never auto-imported.

- `auth.ts` — `useAuthStore`: `user`, `isAuthenticated` (profile or a token, via
  a `hasToken` ref synced by `onTokensChanged` and by other tabs' `storage` events), `hydrate()` (on a 401 calls
  `AuthModel.revokeSession()`; keeps the session on network errors), `hydrateError` / `retrying` / `retryHydrate()`. On session end the store's listener resets the profile and, via `resetQueriesToSignedOut` (`services/core/query-client.ts`), the queries in place so mounted views stay attached. `plugins/session-expiry.ts` routes to
  `/login?redirect=…` on session expiry and leaves a protected page for plain
  `/login` on another tab's logout (this tab's logout navigates itself). The store has no `logout` or `clearSession` action: `App.vue` runs `useLogoutMutation`, whose `onSettled` only routes to `/login` (`AuthModel.logout()` and the session-end listener already cleared everything).
- `counter.ts` — `useCounterStore`: demo `count` + `increment/decrement/reset`.
- `socket-io.ts` — `useSocketIOStore`: holds the live `Socket | null` and an
  `authenticated` flag; `setSocketIO(partial)` merges state.

## Socket.IO Composable (`src/composables/useSocketIO.ts`)

`useSocketIO()` builds a websocket connection scoped to the component tree. Auth
payload defaults to `{ token: 'Bearer <access token>', role: 'user' }` plus
optional HMAC `{ sig, ctime }` when `VITE_HMAC_SECRET` is set. Connects on
mount, throttled reconnect on auth errors, and cleans up listeners +
disconnects on scope dispose. Also exports `useIo()` (get/lazy-init the live
socket) and `useSocketEvent(event, cb)` (subscribe with auto cleanup). Event
names come from `SOCKET_EVENT` in `src/enums/socket-events.ts`.

## Related Documentation

- [Directory Structure](./directory-structure.md)
- [Conventions](./conventions.md)
- [system-architecture.md](../system-architecture.md) — auth/data-flow detail
