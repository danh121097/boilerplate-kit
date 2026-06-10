# Services and Stores

## Server Helpers (`src/server/`)

**RSC and async Server Components only.** Never call from client code.

| File              | Purpose                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `server-api.ts`   | `serverApiGet<T>(path)` — fetch with forwarded auth cookies + HMAC   |
| `get-me.ts`       | `getMeServerData()` — resolve current user server-side               |
| `get-users.ts`    | `getUsersServerData()` — fetch users list server-side                |

## Service Layer (`src/services/`)

**Client-side only.** Uses httpOnly cookies (auto-sent by browser);
never touches `localStorage` or reads tokens directly.

### core/

| File                       | Purpose                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `api.ts`                   | `Api` class — axios wrapper, `withCredentials: true`               |
| `auth-refresh-client.ts`   | Bare axios call to refresh endpoint (no interceptors)              |
| `hmac-signature.ts`        | HMAC-SHA256 signing via `NEXT_PUBLIC_HMAC_SECRET`                  |
| `headers-utils.ts`         | Attach HMAC headers to requests (no Bearer — cookies auto-sent)    |
| `interceptors.ts`          | Request/response interceptors + 401 → refresh → replay             |
| `model.ts`                 | Base `Model` class — subclass + call `Model.setup()`               |
| `refresh-token-manager.ts` | Single-flight token refresh deduplication                          |
| `tanstack.ts`              | `defineQuery` + `defineMutation` factory helpers                   |
| `types.ts`                 | Shared TypeScript types + axios module augmentation                |

### auth/

- `contract.ts` — endpoint paths + React Query keys (single source of truth)
- `AuthModel` — login, register, logout, getMe
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
