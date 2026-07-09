# Services and Stores

## Service Layer

```
src/services/
├── init-services.ts        # Wire baseURLs + register tokens + install interceptors + onSessionExpired
├── index.ts                # Barrel re-export
├── core/
│   ├── api.ts              # Api class — multi-service axios wrapper
│   ├── interceptors.ts     # ApiInterceptors — request (HMAC+Bearer) + response (refresh)
│   ├── refresh-token-manager.ts  # Single-flight refresh deduplication
│   ├── auth-refresh-client.ts    # Bare axios refresh call (no interceptors)
│   ├── auth-token-storage.ts     # Per-service expo-secure-store token registry (async)
│   ├── headers-utils.ts    # HeadersUtils.setAuthHeaders / addAuthorizationHeader
│   ├── hmac-signature.ts   # HMACSignatureGenerator (crypto-js, EXPO_PUBLIC_HMAC_SECRET)
│   ├── model.ts            # Model base class — subclass + Model.setup()
│   ├── tanstack.ts         # defineQuery / defineMutation (React Query)
│   ├── types.ts            # Shared TS types + axios module augmentation
│   └── index.ts
├── auth/
│   ├── auth.ts             # AuthModel + useLoginMutation, useRegisterMutation, etc.
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
- **initServices()**: called once in `app/_layout.tsx` (root layout) before providers mount. Also sets injected `onSessionExpired` callback for router navigation on hard logout.
- **Token storage is async**: `SecureStore.getItemAsync()` returns a promise; all token reads/writes must await.

## Zustand Stores

```
src/stores/
├── auth.ts       # useAuthStore: token / isLoggedIn / setToken / logout
└── socket-io.ts  # useSocketIOStore: socket connection state
```

Always import stores explicitly — no auto-import.
