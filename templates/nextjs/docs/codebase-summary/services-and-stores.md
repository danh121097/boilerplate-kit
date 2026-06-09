# Services and Stores

## Service Layer (`src/services/`)

**Client-side only.** All `localStorage` / `window` access is SSR-guarded.

### core/

| File | Purpose |
|------|---------|
| `api.ts` | `Api` class — axios wrapper, multi-service baseURL registry |
| `auth-token-storage.ts` | localStorage token CRUD, SSR-guarded via `isClient()` |
| `auth-refresh-client.ts` | Bare axios call to refresh endpoint (no interceptors) |
| `hmac-signature.ts` | HMAC-SHA256 signing via `NEXT_PUBLIC_HMAC_SECRET` |
| `headers-utils.ts` | Attach HMAC + Bearer headers to requests |
| `interceptors.ts` | Request/response interceptors + 401 → refresh → replay |
| `model.ts` | Base `Model` class — subclass + call `Model.setup()` |
| `refresh-token-manager.ts` | Single-flight token refresh deduplication |
| `tanstack.ts` | `defineQuery` + `defineMutation` factory helpers |
| `types.ts` | Shared TypeScript types + axios module augmentation |

### auth/

- `AuthModel` — login, register, logout, getMe
- `useLoginMutation`, `useRegisterMutation`, `useLogoutMutation`, `useMeQuery`

### users/

- `UsersModel` — list, get, update
- `useUsersListQuery`

### init-services.ts

Called once in `useEffect` inside `app/providers.tsx`. Wires baseURLs,
token storage slots, and interceptors for each service.

## Stores (`src/stores/`)

| File | Purpose |
|------|---------|
| `counter.ts` | Zustand counter — `count`, `increment`, `decrement`, `reset` |
