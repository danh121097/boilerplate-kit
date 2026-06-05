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
| `interceptors.ts` | `ApiInterceptors`: request (attach HMAC + Bearer + `serviceType`) and response (unwrap envelopes, drive 401 refresh/retry) |
| `refresh-token-manager.ts` | `RefreshTokenManager`: single-flight refresh per service — a burst of 401s triggers exactly one network refresh |
| `auth-refresh-client.ts` | `createTokenRefresher()`: bare, interceptor-free call to the refresh endpoint (avoids refresh recursion); extracts new access token from common envelope shapes |
| `auth-token-storage.ts` | Per-service access-token registry in `localStorage`: `getAuthToken`, `persistAuthToken`, `clearAuthToken`, `clearAuthTokens`, `registerServiceToken` |
| `headers-utils.ts` | `HeadersUtils`: attach HMAC signature headers + Bearer authorization header |
| `hmac-signature.ts` | `HMACSignatureGenerator`: HMAC-SHA256 sign per request; **no-op unless `VITE_HMAC_SECRET` is set** |
| `tanstack.ts` | `defineQuery()` / `defineMutation()` factories typed against `ApiResponseError` |
| `types.ts` | Shared types (`ApiService`, `ApiResponse`, `ApiResponseError`, `RefreshOptions`, …) + axios module augmentation (`serviceType`, `_retry`) |

### `init-services.ts`

Single place to declare every backend. Each row wires a base URL, the token
storage slot, and (optionally) a refresh endpoint. Rows with an empty base URL
are skipped; presence of `refresh` enables per-service auto-refresh.

```ts
const SERVICES: ServiceDefinition[] = [
  { name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    tokenKey: STORAGE_KEYS.AUTH_TOKEN,
    refresh: { endpoint: "/auth/refresh" } },
];
```

### Auth & Users services

- `auth/auth.ts` — `AuthModel` (`/auth`): `login`, `register`, `logout`,
  `getMe`; persists the access token via `persistAuthToken`, clears on logout.
  Exposes `useLoginMutation`, `useRegisterMutation`, `useLogoutMutation`,
  `useMeQuery`. Types in `auth/types/auth.ts`.
- `users/users.ts` — `UsersModel` (`/users`): `list`, `get`, `update`; exposes
  `useUsersListQuery`. Types in `users/types/user.ts`.

Models read responses as already-unwrapped payloads because the response
interceptor strips a recognized envelope (`{ status: "success" }` or
`{ success: true }`).

## Pinia Stores (`src/stores/`)

Setup-style stores. Imported explicitly — never auto-imported.

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
