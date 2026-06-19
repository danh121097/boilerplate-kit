# Test Matrix

This file maps product behavior to proof. Proof is the test suite, run with:

```bash
pnpm test     # alias for: vitest run
```

Suite as shipped: **13 test files**, **141 tests** (138 pass + 3 socket tests
skipped unless a TCP port is available — set `SKIP_SOCKET_TESTS=true` to skip
them explicitly in CI). Specs live under `test/` (unit + e2e) plus two
co-located guard/DI specs under `src/common/`. Counts are approximate — re-run
the command for the live number.

Vitest runs through `unplugin-swc` so decorator metadata (`emitDecoratorMetadata`)
survives transpilation — NestJS dependency injection depends on it. E2E specs
boot a real Nest app against an in-memory MongoDB (`mongodb-memory-server`) and
drive it with `supertest` (HTTP) and `socket.io-client` (WebSocket).

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

Behavior → proof. Proof column = test file, run via `pnpm test` (`vitest run`).

| Behavior | Layer | Status | Proof (`pnpm test`) |
| --- | --- | --- | --- |
| Auth lifecycle over HTTP: register → login → me → refresh rotation → logout, envelope + httpOnly cookies, password never leaked | e2e | implemented | `test/e2e/auth-lifecycle.e2e-spec.ts` |
| Refresh-token reuse detection: replaying a rotated token revokes all sessions; fresh login recovers (DB-driven, Redis off) | e2e | implemented | `test/e2e/refresh-token-reuse-detection.e2e-spec.ts` |
| HMAC guard: signed requests pass; missing/tampered/expired `sig`/`ctime` rejected; guard ordering (HMAC → JWT → roles); `@Public` skips JWT but not HMAC | e2e | implemented | `test/e2e/hmac-guard.e2e-spec.ts` |
| RBAC on `/users`: `@Roles('admin')` — role=user → 403, role=admin → 200; `/users/:id`; pagination meta shape; password excluded | e2e | implemented | `test/e2e/user-rbac.e2e-spec.ts` |
| Socket.IO gateway handshake: HMAC then JWT gate, per-user room, authenticated emit (skipped without a TCP port) | e2e | implemented | `test/e2e/realtime-gateway.e2e-spec.ts` |
| HMAC signer parity: e2e `sign-request` helper byte-matches `HmacService` (GET/POST, path derivation, query strip, socket handshake, bad/expired sigs) | unit | implemented | `test/unit/hmac-signer-parity.spec.ts` |
| TokenService: sign/verify access (RS256) + refresh (HS256), `token_use` mismatch rejection, unique `jti`, `hashToken` determinism | unit | implemented | `test/unit/token-service.spec.ts` |
| Password strength: length ≥ 8 + char-class requirements, `VALIDATION_ERROR` shape | unit | implemented | `test/unit/password-service.spec.ts` |
| Role rank: `ROLE_RANK` ordering (user < admin < super_admin), min-role authorization logic | unit | implemented | `test/unit/role-rank.spec.ts` |
| Pagination helpers: offset clamp/skip + meta math, cursor keyset + trim, hasNext/hasPrev | unit | implemented | `test/unit/pagination-util.spec.ts` |
| Token revocation + cache helpers no-op / fail-open when Redis disabled; access-TTL parsing | unit | implemented | `test/unit/token-revocation-no-redis.spec.ts` |
| SecurityGuard composite logic: HMAC/CSRF/JWT/role steps, `derivePath`, `@Public`/`@Roles` handling | unit | implemented | `src/common/guards/security.guard.spec.ts` |
| DI wiring: every provider resolves from the Nest container (metadata survives SWC transpile) | unit | implemented | `src/common/di-gate.spec.ts` |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration / E2E proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts (here: full Nest app + in-memory Mongo).
- E2E proof covers user-visible HTTP and WebSocket flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
