# Services and Stores

## Service Layer

```
src/services/
├── init-services.ts        # Wire baseURLs + register tokens + install interceptors
├── session-expiry.ts       # setupSessionExpiry: /login on session end (return path on expiry)
├── index.ts                # Barrel re-export
├── core/
│   ├── api.ts              # Api class — multi-service axios wrapper
│   ├── interceptors.ts     # ApiInterceptors — request (HMAC+Bearer) + response (refresh)
│   ├── refresh-token-manager.ts  # Single-flight + cross-tab (Web Lock) refresh, withSessionLock
│   ├── session.ts          # Per-service epoch/logout-pending, onSessionEnded / endSession,
│   │                       #   syncAuthAcrossTabs, redirectOnSessionExpired, safeRedirect
│   ├── api-errors.ts       # toApiError, isRefreshRefused, refreshUnavailable, SessionEndedError…
│   ├── app-prefix.ts       # getAppPrefix — storage key / lock-name prefix
│   ├── auth-refresh-client.ts    # Bare axios refresh call (no interceptors), REFRESH_TIMEOUT_MS
│   ├── auth-token-storage.ts     # Per-service localStorage token registry + onTokensChanged
│   ├── query-client.ts     # resetQueriesToSignedOut / resetQueriesOnSessionEnd / resyncQueriesAfterLogin
│   ├── headers-utils.ts    # HeadersUtils.setAuthHeaders / addAuthorizationHeader
│   ├── hmac-signature.ts   # HMACSignatureGenerator.signRequest / generateSignature, resolveContentType
│   ├── model.ts            # Model base class — subclass + Model.setup()
│   ├── tanstack.ts         # defineQuery / defineMutation (React Query)
│   ├── types.ts            # Shared TS types (incl. pagination) + axios module augmentation
│   └── index.ts
├── auth/
│   ├── auth.ts             # AuthModel (getMe, getSession → AuthUser | null, logout, isLoggingOut, revokeSession) + useMeQuery, mutations
│   ├── schema/login.ts  # loginSchema (zod; messages are i18n keys) + LoginFormValues
│   ├── data/mock-auth*.ts  # Dev-only mock auth adapter (VITE_AUTH_MOCK)
│   ├── types/auth.ts       # AuthUser, AuthResult, LoginPayload, RegisterPayload
│   └── index.ts
└── users/
    ├── users.ts            # UsersModel (list → PaginatedResponse<User>, get/update → User) + useUsersListQuery
    ├── types/user.ts       # User, UpdateUserPayload
    └── index.ts
```

### Key patterns

- **Model subclass**: `class FooModel extends Model { static { Model.setup.call(this, { path: "/foo" }) } }`
- **defineQuery**: returns a hook + `.key` + `.queryKey()` — queryKey is a stable array.
- **defineMutation**: returns a hook + `.key` — wraps `useMutation`, invalidates keys on success.
- **initServices()**: called once in `main.tsx` before providers mount.

## Zustand Stores

```
src/stores/
├── auth.ts       # useAuthStore (user, isAuthenticated, hydrated, hydrateError, setUser, hydrate, retryHydrate) + syncAuthWithOtherTabs
├── counter.ts    # useCounterStore: count / increment / decrement / reset
└── socket-io.ts  # Socket.IO connection store
```

The auth store only reacts to the auth service's session end
(`authContract.service`); another service's refused refresh leaves the user
signed in.

Always import stores explicitly — no auto-import.
