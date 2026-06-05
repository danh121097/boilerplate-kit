# Test Matrix

Maps behavior to proof. Proof column = `pnpm test` (Vitest, ~40 tests across
`src/__tests__/`). Run a single file with `pnpm test <path>`.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Behavior | Contract | Proof (file) | Layer | Status |
| --- | --- | --- | --- | --- |
| Token storage (per service) | Persist/read/clear bearer tokens per service slot; `MAIN` default; `clearAuthToken` is scoped; `clearAuthTokens` clears all; unknown service falls back to `MAIN` slot | `pnpm test` → `unit/auth-token-storage.test.ts` | Unit | implemented |
| HMAC request signing | Builds canonical string `METHOD\nContent-Type\nctime\npath\n` and HMAC-SHA256/base64 signature; returns null with no secret; normalizes missing leading slash; emits `x-version` — **cross-checked against a re-implementation of the server's `verifyHmac`** | `pnpm test` → `unit/hmac-signature.test.ts` | Unit | implemented |
| Request headers | `setAuthHeaders` passes through unchanged with no HMAC secret, merges `sig`/`ctime` when secret set (keeps original headers); `addAuthorizationHeader` attaches `Bearer <token>` when stored, no-op otherwise | `pnpm test` → `unit/headers-utils.test.ts` | Unit | implemented |
| Api routing | Per-service base URL registry (`MAIN` default, empty fallback); GET/POST to resolved baseURL with `withCredentials`; url override + JSON-serialized body; merges `customHeaders`; `postFormData` routes as POST | `pnpm test` → `unit/api.test.ts` | Unit | implemented |
| Model setup | `Model.setup` wires `path`, `service` (default `MAIN`), and an `Api` instance onto the subclass; honors explicit service; isolates config between subclasses | `pnpm test` → `unit/model.test.ts` | Unit | implemented |
| Refresh single-flight (manager) | Concurrent `getFreshToken` calls dedupe into one refresh + persist; refreshes again after in-flight settles; on reject clears the service token and fires `onRefreshFailed` | `pnpm test` → `unit/refresh-token-manager.test.ts` | Unit | implemented |
| defineQuery / defineMutation | Exposes `key`; builds param-less and parameterized query keys (`[key]`, `[key, param]`) | `pnpm test` → `unit/tanstack.test.ts` | Unit | implemented |
| 401 → refresh → replay (interceptors) | Refreshes once and replays the failed request transparently; single-flights concurrent 401s into one refresh; does NOT clear refreshed token on non-auth replay failure; gives up after one retry (no loop) and clears token; never refreshes anonymous traffic | `pnpm test` → `integration/interceptors-refresh.test.ts` | Integration | implemented |
| Auth service (login/register/logout/getMe) | `login`/`register` persist the access token and return the result; `logout` clears the token (even when the request fails); `getMe` returns the unwrapped user from the envelope | `pnpm test` → `integration/auth-service.test.ts` | Integration | implemented |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts (here: the real axios interceptor stack +
  auth service against stubbed transport).
- E2E proof covers user-visible browser flows. _(None yet.)_
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers. _(None yet.)_
- A story can be implemented without every proof column if the story packet
  explains why.
