# Lint, Format, and Test

Back to [Code Standards](../code-standards.md).

## Tooling

- ESLint flat config checks src TypeScript and import ordering.
- Prettier formats source, tests, configs, and Markdown.
- TypeScript uses tsc --noEmit.
- Vitest runs test/**/*.test.ts (test/unit, test/integration; shared helpers in test/helpers).
- Tests call Fastify's app.inject() and use mongodb-memory-server; no external
  MongoDB service is needed.

## Commands

- pnpm lint
- pnpm lint:fix
- pnpm typecheck
- pnpm format:check
- pnpm test
- pnpm test:watch
- pnpm test:coverage

Test coverage is configured in package.json through the Vitest v8 provider.
See vitest.config.ts for global setup, test setup, and timeout behavior.

## Real-Redis lane

`pnpm test:redis` runs `test/redis/*.redis.ts` against a real Redis (`vitest.redis.config.ts`);
the default `pnpm test` never touches it. Set `REDIS_URL` to a **disposable** Redis, for example
`REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis`; without it the lane prints a skip message and exits 0.
It boots two app copies on one Redis and proves: rate-limit counters are shared (limit hit on A,
429 on B), a logout on A revokes the access token on B, and a Redis outage (a TCP proxy that is cut
and restored) fails open and resumes counting. Each test clears the `rl:*`-style limiter and
`revoked:user:*` keys first. CI runs it in the `backend-redis` job with a Redis service container.

The lane deletes keys (via `SCAN`), so it refuses to run unless the `REDIS_URL` host is `127.0.0.1`,
`localhost` or `::1`: the suite fails with a message naming the variable, it does not skip. Set
`REDIS_TEST_ALLOW_REMOTE=true` to accept a remote disposable Redis (never a shared or production one).
The outage scenario forwards the URL's password and database number through its proxy; `rediss://` (TLS)
URLs are not supported by the lane.
