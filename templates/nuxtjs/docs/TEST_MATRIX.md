# Test Matrix

This file maps behavior to proof.

The template ships a working service-layer test suite (41 `it()` cases across 7
unit + 2 integration files under `app/__tests__/`). Proof for every row below is
`pnpm test` (Vitest). Add product-behavior rows here as story packets are created;
do not mark a row implemented until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix — Service Layer (shipped)

Proof column = run `pnpm test` (Vitest). Cases counted from the test sources.

| Behavior | Proof (test file) | Cases | Layer | Status |
| --- | --- | --- | --- | --- |
| Auth token storage: per-service slots, MAIN default, single/all clear, unregistered fallback | `app/__tests__/unit/auth-token-storage.test.ts` | 7 | unit | implemented |
| Token storage is SSR-safe: returns `null` when there is no `window`/`localStorage` | `app/__tests__/unit/auth-token-storage.test.ts` | (1 of 7) | unit | implemented |
| HMAC signature: canonical string cross-checks the server, URL normalization, `x-version` build tag, null when no secret | `app/__tests__/unit/hmac-signature.test.ts` | 4 | unit | implemented |
| Header utils: pass-through without secret, merge HMAC headers with secret, attach/skip `Bearer` token | `app/__tests__/unit/headers-utils.test.ts` | 4 | unit | implemented |
| Api routing: per-service base URL registry (MAIN default), GET/POST with credentials, url override, custom headers, `postFormData` | `app/__tests__/unit/api.test.ts` | 6 | unit | implemented |
| Model.setup: wires path/service/Api onto subclass, honors explicit service, isolates config between subclasses | `app/__tests__/unit/model.test.ts` | 3 | unit | implemented |
| Refresh single-flight: dedupes concurrent calls, refreshes again after settle, clears token + fires `onRefreshFailed` on reject | `app/__tests__/unit/refresh-token-manager.test.ts` | 3 | unit | implemented |
| TanStack `defineQuery` / `defineMutation`: key exposure, param-less + parameterized query keys, mutation key | `app/__tests__/unit/tanstack.test.ts` | 4 | unit | implemented |
| Auth service: login/register persist access token, logout clears (even on request failure), `getMe` unwraps user | `app/__tests__/integration/auth-service.test.ts` | 5 | integration | implemented |
| Interceptor refresh + 401 replay: refresh once and replay, single-flight concurrent 401s, keep token on non-auth replay failure, give up after one retry (no loop), skip refresh for anonymous traffic | `app/__tests__/integration/interceptors-refresh.test.ts` | 5 | integration | implemented |

**Total: 41 cases** (`pnpm test`).

## Matrix — Product Behavior

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TBD | Add rows when story packets are created | no | no | no | no | planned | none |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
