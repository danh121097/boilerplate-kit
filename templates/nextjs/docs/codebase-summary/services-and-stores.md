# Services and Stores

## Server Helpers (`src/server/`)

**RSC and async Server Components only.** Never call from client code.

| File              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `server-api.ts`   | `serverApiGet` / `serverApiPaginate` / `serverApiCursorPaginate` — fetch with the access cookie + HMAC; reject with an `ApiResponseError` (401 when the access cookie is missing or rejected; no server refresh). `hasServerSessionHint()` |
| `session.ts`      | `readServerSession()` — current user, or null when anonymous (no session hint) |
| `get-users.ts`    | `getUsersServerData()` — fetch users list server-side                |

## Service Layer (`src/services/`)

**Client-side only.** Uses httpOnly cookies (auto-sent by browser);
never touches `localStorage` or reads tokens directly.

### core/

| File                       | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `api.ts`                   | `Api` class — axios wrapper, `withCredentials: true`               |
| `api-errors.ts`            | `toApiError`, `isUnauthorizedError`, `isRefreshRefused`, `refreshUnavailable`, `SessionEndedError`, `getApiErrorMessage` |
| `app-prefix.ts`            | `getAppPrefix()` — prefix for lock and storage keys                |
| `auth-refresh-client.ts`   | `createTokenRefresher` — bare axios refresh call (no interceptors), `REFRESH_TIMEOUT_MS` |
| `hmac-signature.ts`        | HMAC-SHA256 signing via `NEXT_PUBLIC_HMAC_SECRET`; `signRequest`, `resolveContentType` |
| `headers-utils.ts`         | Attach HMAC headers to requests (no Bearer — cookies auto-sent)    |
| `interceptors.ts`          | Request/response interceptors + 401 → refresh → replay             |
| `model.ts`                 | Base `Model` class — subclass + call `Model.setup()`               |
| `refresh-token-manager.ts` | Single-flight + cross-tab (Web Lock) refresh, `withSessionLock`    |
| `session.ts`               | Per-service epoch + logout-pending, session hint, `onSessionEnded` / `endSession(reason, service)`, `syncAuthAcrossTabs`, `redirectOnSessionExpired`, `safeRedirect` |
| `query-client.ts`          | `makeQueryClient`, `resetQueriesOnSessionEnd(client, key, service)`, `resyncQueriesAfterLogin` |
| `tanstack.ts`              | `defineQuery` + `defineMutation` factory helpers                   |
| `types.ts`                 | Shared TypeScript types + axios module augmentation                |

### auth/

- `contract.ts` — endpoint paths + React Query keys (single source of truth)
- `AuthModel` — login, register, logout, revokeSession, getMe, getSession (401 → null; a live session is revoked first)
- `useLoginMutation`, `useRegisterMutation`, `useLogoutMutation`, `useMeQuery`
- `session.ts` — `useAuth()` hook (derives from useMeQuery)

### users/

- `contract.ts` — endpoint paths + React Query keys
- `UsersModel` — list, get, update
- `useUsersListQuery`

### query-keys.ts

Aggregates all React Query keys from service contracts (single registry).

### init-services.ts

Called once in `useEffect` inside `app/providers.tsx`. Wires baseURLs,
refresh configs, and interceptors for each service.

## Stores (`src/stores/`)

| File         | Purpose                                                      |
| ------------ | ------------------------------------------------------------ |
| `counter.ts` | Zustand counter — `count`, `increment`, `decrement`, `reset` |
