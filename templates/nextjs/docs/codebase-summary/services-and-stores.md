# Services and Stores

## Server Helpers (`src/server/`)

**RSC and async Server Components only.** Never call from client code.

| File              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `server-api.ts`   | `serverApiGet` / `serverApiPaginate` / `serverApiCursorPaginate` — fetch with the access cookie + HMAC; reject with an `ApiResponseError` (401 when the access cookie is missing or rejected; no server refresh). |
| `get-users.ts`    | `getUsersServerData()` — users list server-side, returns `PaginatedResponse<User>` |
| `hydrated-queries.tsx` | `<HydratedQueries prefetch=…>` — prefetch, dehydrate, `HydrationBoundary`; `serverQuery(def, serverFetcher)` pairs a definition with its server fetcher |
| `queries/`        | One paired server query per resource (`usersListServer`) — what pages prefetch |

## Service Layer (`src/services/`)

**Client-side only.** Uses httpOnly cookies (auto-sent by browser);
never touches `localStorage` or reads tokens directly.

### core/

| File                       | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `api.ts`                   | `Api` class — axios wrapper, `withCredentials: true`; `paginate` / `cursorPaginate` return the full `{ data, meta }` envelope |
| `api-errors.ts`            | `toApiError`, `isUnauthorizedError`, `isRefreshRefused`, `isHmacError` / `HMAC_ERROR_TYPE`, `isSessionGoneError` (401 or 404), `refreshUnavailable`, `refreshHmacRejected`, `SessionEndedError`, `getApiErrorMessage` |
| `app-prefix.ts`            | `getAppPrefix()` — prefix for lock and storage keys                |
| `auth-refresh-client.ts`   | `createTokenRefresher` — bare axios refresh call (no interceptors), `REFRESH_TIMEOUT_MS` |
| `hmac-signature.ts`        | HMAC-SHA256 signing via `NEXT_PUBLIC_HMAC_SECRET`; `signRequest`, `resolveContentType`; dev warning once when the secret is empty |
| `headers-utils.ts`         | Attach HMAC headers to requests (no Bearer — cookies auto-sent)    |
| `interceptors.ts`          | Request/response interceptors + 401 → refresh → replay             |
| `session-refresher.ts`     | `registerSessionRefresher` / `refreshSession` — lets the socket hook refresh through the interceptors |
| `model.ts`                 | Base `Model` class — subclass + call `Model.setup()`               |
| `refresh-token-manager.ts` | Single-flight + cross-tab (Web Lock) refresh, `withSessionLock`    |
| `session.ts`               | Per-service epoch + logout-pending, session hint, `onSessionEnded` / `endSession(reason, service)`, `syncAuthAcrossTabs`, `redirectOnSessionExpired`, `safeRedirect` |
| `query-client.ts`          | `makeQueryClient`, `resetQueriesOnSessionEnd(client, key, service)`, `resyncQueriesAfterLogin` |
| `tanstack.ts`              | `defineQuery` (hook + `key`, `queryKey`, `queryOptions`) |
| `tanstack-mutation.ts`     | `defineMutation` (`invalidates`, opt-in `optimistic`, `.mutationOptions()`) |
| `tanstack-optimistic.ts`   | Optimistic snapshot / rollback helpers used by `defineMutation` |
| `types.ts`                 | Shared types + axios module augmentation; pagination: `OffsetMeta`, `CursorMeta`, `PaginatedResponse<T>`, `CursorResponse<T>`, `PaginationParams`, `CursorParams` |

### auth/

- `contract.ts` — endpoint paths + React Query keys (single source of truth)
- `AuthModel` — login, register, logout, revokeSession, getMe, getSession (401 or 404 → null via `isSessionGoneError`; a live session is revoked first)
- `useLoginMutation`, `useRegisterMutation`, `useLogoutMutation`, `useMeQuery`
- `types/auth.ts` — `AuthUser = User` (the users `User` shape; `Role = "user" | "admin" | "super_admin"`, from `users/types/user.ts`)
- `schema/login.ts` — zod `loginSchema` (email, password non-empty); `data/mock-auth*.ts` — dev-only mock auth
- `session.ts` — `useAuth()` hook (derives from useMeQuery): `user`, `isAuthenticated`, `isLoading`, `sessionUnavailable`, `retrySession`; `isSessionUnavailable(error)`

### users/

- `contract.ts` — endpoint paths + React Query keys
- `UsersModel` — `list(params?: PaginationParams): Promise<PaginatedResponse<User>>`, `get(id): Promise<User>` (`get` unwraps the response)
- `useUsersListQuery` — returns the `PaginatedResponse<User>` envelope; pages read the array from `data.data`
- `data/mock-users.ts` — dev-only mock of `GET /users` answering the same `{ data, meta }` envelope

### query-keys.ts

Aggregates all React Query keys from service contracts (single registry).

### init-services.ts

Called once at module load in the browser (`app/providers.tsx`, guarded by
`typeof window`), before any query runs. Wires baseURLs, refresh configs, and
interceptors for each service.

## Stores (`src/stores/`)

| File         | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `counter.ts` | Zustand counter — `count`, `increment`, `decrement`, `reset` |
| `socket-io.ts` | Zustand Socket.IO state — `socket`, `authenticated`, `setSocketIO` |
