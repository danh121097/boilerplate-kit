# Test Matrix

Behavior-to-proof mapping. Current test suite: 9 files, ~37 test cases.

## HMAC & Headers

| Behavior                                               | Test file                    | Status |
| ------------------------------------------------------ | ---------------------------- | ------ |
| HMAC returns null with no secret                       | `unit/hmac-signature.test.ts` | ✅     |
| HMAC canonical string matches server signature format | `unit/hmac-signature.test.ts` | ✅     |
| URL without leading slash normalized                  | `unit/hmac-signature.test.ts` | ✅     |
| `x-version` header included when set                  | `unit/hmac-signature.test.ts` | ✅     |
| `setAuthHeaders` passes through when no secret        | `unit/headers-utils.test.ts`  | ✅     |
| `setAuthHeaders` merges HMAC headers                  | `unit/headers-utils.test.ts`  | ✅     |

## Api Class

| Behavior                                  | Test file           | Status |
| ----------------------------------------- | ------------------- | ------ |
| `Api.getBaseURL` per-service with default | `unit/api.test.ts`   | ✅     |
| GET uses path + baseURL + credentials     | `unit/api.test.ts`   | ✅     |
| POST with url override + body             | `unit/api.test.ts`   | ✅     |
| `customHeaders` merged into request       | `unit/api.test.ts`   | ✅     |
| Paginate + cursor pagination methods      | `unit/api.test.ts`   | ✅     |

## Models & TanStack

| Behavior                                     | Test file                      | Status |
| -------------------------------------------- | ------------------------------ | ------ |
| `Model.setup` wires path + service + Api     | `unit/model.test.ts`           | ✅     |
| `Model.setup` isolates subclasses            | `unit/model.test.ts`           | ✅     |
| `RefreshTokenManager` single-flight deduplication | `unit/refresh-token-manager.test.ts` | ✅     |
| Re-refresh after settlement                  | `unit/refresh-token-manager.test.ts` | ✅     |
| Failure triggers `onRefreshFailed` hook      | `unit/refresh-token-manager.test.ts` | ✅     |
| `defineQuery.key` exposed                    | `unit/tanstack.test.ts`        | ✅     |
| `defineQuery.queryKey()` no params           | `unit/tanstack.test.ts`        | ✅     |
| `defineQuery.queryKey(id)` with params       | `unit/tanstack.test.ts`        | ✅     |
| `defineMutation.key` exposed                 | `unit/tanstack.test.ts`        | ✅     |
| Query keys aggregated from contracts         | `unit/query-keys.test.ts`      | ✅     |

## Interceptors (integration)

| Behavior                                  | Test file                                  | Status |
| ----------------------------------------- | ------------------------------------------ | ------ |
| 401 → refresh → replay transparent        | `integration/interceptors-refresh.test.ts` | ✅     |
| Concurrent 401s → single refresh          | `integration/interceptors-refresh.test.ts` | ✅     |
| Replay 500 does NOT clear refreshed token | `integration/interceptors-refresh.test.ts` | ✅     |
| No infinite loop after one retry          | `integration/interceptors-refresh.test.ts` | ✅     |
| Anonymous traffic → no refresh attempt    | `integration/interceptors-refresh.test.ts` | ✅     |

## Auth Service (Integration)

| Behavior                          | Test file                          | Status |
| --------------------------------- | ---------------------------------- | ------ |
| `login` sends credentials + gets token | `integration/auth-service.test.ts` | ✅     |
| `register` sends signup + gets token   | `integration/auth-service.test.ts` | ✅     |
| `logout` clears session                | `integration/auth-service.test.ts` | ✅     |
| `logout` clears even on error          | `integration/auth-service.test.ts` | ✅     |
| `getMe` returns unwrapped user         | `integration/auth-service.test.ts` | ✅     |
