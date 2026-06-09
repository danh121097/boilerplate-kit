# Test Matrix

Behavior-to-proof mapping. Each row links a testable behavior to its proof location.

## Service Core

| Behavior | Test file | Status |
|----------|-----------|--------|
| `getAuthToken` returns null when empty | `unit/auth-token-storage.test.ts` | ✅ |
| Token persisted and read per service | `unit/auth-token-storage.test.ts` | ✅ |
| `clearAuthToken` removes only target service | `unit/auth-token-storage.test.ts` | ✅ |
| `clearAuthTokens` removes all services | `unit/auth-token-storage.test.ts` | ✅ |
| `getAuthToken` returns null on server (no window) | `unit/auth-token-storage.test.ts` | ✅ |
| `persistAuthToken` no-op on server (no window) | `unit/auth-token-storage.test.ts` | ✅ |
| `clearAuthToken` no-op on server (no window) | `unit/auth-token-storage.test.ts` | ✅ |
| HMAC returns null with no secret | `unit/hmac-signature.test.ts` | ✅ |
| HMAC canonical string matches server sign | `unit/hmac-signature.test.ts` | ✅ |
| URL without leading slash normalized | `unit/hmac-signature.test.ts` | ✅ |
| `x-version` header included | `unit/hmac-signature.test.ts` | ✅ |
| `addAuthorizationHeader` attaches Bearer | `unit/headers-utils.test.ts` | ✅ |
| `addAuthorizationHeader` no-op when no token | `unit/headers-utils.test.ts` | ✅ |
| `addAuthorizationHeader` no-op on server (SSR guard) | `unit/headers-utils.test.ts` | ✅ |
| `Api.getBaseURL` per-service with fallback | `unit/api.test.ts` | ✅ |
| GET uses path + baseURL + credentials | `unit/api.test.ts` | ✅ |
| POST with url override + body | `unit/api.test.ts` | ✅ |
| `customHeaders` merged | `unit/api.test.ts` | ✅ |
| `Model.setup` wires path + service + Api | `unit/model.test.ts` | ✅ |
| `Model.setup` respects service override | `unit/model.test.ts` | ✅ |
| `RefreshTokenManager` single-flight dedupe | `unit/refresh-token-manager.test.ts` | ✅ |
| Re-refresh after settlement | `unit/refresh-token-manager.test.ts` | ✅ |
| Failure clears token + fires hook | `unit/refresh-token-manager.test.ts` | ✅ |
| `defineQuery.key` exposed | `unit/tanstack.test.ts` | ✅ |
| `defineQuery.queryKey()` no params | `unit/tanstack.test.ts` | ✅ |
| `defineQuery.queryKey(id)` with params | `unit/tanstack.test.ts` | ✅ |
| `defineMutation.key` exposed | `unit/tanstack.test.ts` | ✅ |

## Interceptors (integration)

| Behavior | Test file | Status |
|----------|-----------|--------|
| 401 → refresh → replay transparent | `integration/interceptors-refresh.test.ts` | ✅ |
| Concurrent 401s → single refresh | `integration/interceptors-refresh.test.ts` | ✅ |
| Replay 500 does NOT clear refreshed token | `integration/interceptors-refresh.test.ts` | ✅ |
| No infinite loop after one retry | `integration/interceptors-refresh.test.ts` | ✅ |
| Anonymous traffic → no refresh attempt | `integration/interceptors-refresh.test.ts` | ✅ |

## Auth service (integration)

| Behavior | Test file | Status |
|----------|-----------|--------|
| `login` persists token + returns result | `integration/auth-service.test.ts` | ✅ |
| `register` persists token | `integration/auth-service.test.ts` | ✅ |
| `logout` clears token | `integration/auth-service.test.ts` | ✅ |
| `logout` clears even on network error | `integration/auth-service.test.ts` | ✅ |
| `getMe` returns unwrapped user | `integration/auth-service.test.ts` | ✅ |

## SSR Guards (new vs reactjs template)

| Behavior | Test file | Status |
|----------|-----------|--------|
| Storage returns null server-side | `unit/auth-token-storage.test.ts` | ✅ |
| No auth header attached server-side | `unit/headers-utils.test.ts` | ✅ |
| `reloadPage` guarded (typeof window check) | `src/services/core/interceptors.ts` (code review) | ✅ |
| i18n reads env fallback server-side | `src/i18n/i18n.ts` (code review) | ✅ |
