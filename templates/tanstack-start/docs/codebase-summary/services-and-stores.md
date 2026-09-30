# Services and Stores

## Service Layer

```
src/services/
├── init-services.ts        # Wire baseURLs + register tokens + install interceptors
├── index.ts                # Barrel re-export
├── core/
│   ├── api.ts              # Api class — multi-service axios wrapper
│   ├── interceptors.ts     # ApiInterceptors — request (HMAC) + response (401 → refresh)
│   ├── api-errors.ts       # toApiError, isUnauthorizedError, isRefreshRefused, refreshUnavailable, SessionEndedError, getApiErrorMessage
│   ├── app-prefix.ts       # getAppPrefix() — prefix for lock and storage keys
│   ├── refresh-token-manager.ts  # Single-flight + cross-tab (Web Lock) refresh, withSessionLock
│   ├── auth-refresh-client.ts    # createTokenRefresher — bare axios refresh call, REFRESH_TIMEOUT_MS
│   ├── session.ts          # Per-service epoch + logout-pending, session hint, onSessionEnded / endSession(reason, service), syncAuthAcrossTabs, redirectOnSessionExpired, safeRedirect
│   ├── server-session.ts   # ServerUnauthorized + withSessionRefresh (server-fn reads)
│   ├── query-client.ts     # makeQueryClient, resetQueriesOnSessionEnd(client, key, service), resyncQueriesAfterLogin
│   ├── headers-utils.ts    # HeadersUtils.setAuthHeaders (HMAC; cookies auto-sent)
│   ├── hmac-signature.ts   # HMACSignatureGenerator (crypto-js, VITE_HMAC_SECRET), signRequest, resolveContentType
│   ├── model.ts            # Model base class — subclass + Model.setup()
│   ├── tanstack.ts         # defineQuery / defineMutation (React Query)
│   ├── types.ts            # Shared TS types + axios module augmentation
│   └── index.ts
├── auth/
│   ├── auth.ts             # AuthModel (login/register/logout/revokeSession/getMe/getSession) + mutations
│   ├── session.ts          # fetchSession (SSR server fn) + useMeQuery + useAuth (sessionUnavailable, retrySession) + isSessionUnavailable
│   ├── schema/login.ts  # zod loginSchema (i18n-key messages) shared by the login and demo forms
│   ├── data/mock-auth*.ts  # Dev-only mock auth adapter (VITE_AUTH_MOCK)
│   ├── types/auth.ts       # AuthUser, AuthResult, LoginPayload, RegisterPayload
│   └── index.ts
└── users/
    ├── users.ts            # UsersModel + useUsersListQuery
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
└── counter.ts    # useCounterStore: count / increment / decrement / reset
```

Always import stores explicitly — no auto-import.
