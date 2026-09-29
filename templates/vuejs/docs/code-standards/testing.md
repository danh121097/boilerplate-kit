# Testing

Vitest conventions for test setup and teardown.

## What is covered

Vitest runs in the `node` environment with no DOM or Vue render harness, so tests
target the service layer (`services/core`, `auth`, `users` incl. the dev mock),
the Pinia auth store (transient restore failure sets `hydrateError`, retry
recovers, a 401 does not), and the router (unknown URLs resolve to the
`not-found` route). Auto-imported globals a store needs (`defineStore`, `ref`,
`computed`) are stubbed with `vi.stubGlobal` before the module is imported.
`pnpm test` runs everything once.

## Restoring mocks and globals

Restore mocks and stubbed globals in `afterEach` by default:

```ts
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
```

Put per-test cleanup (listener unsubscribes, fake timers) in `onTestFinished`
or `afterEach`, never on the last line of the test body: a failing assertion
skips it and the leak breaks later tests.

## When a cleanup needs the stubbed globals

Vitest runs `afterEach` first, then `onTestFinished` callbacks in reverse
registration order. An `onTestFinished` unsubscribe that touches a stubbed
global (for example `window`) therefore throws once `afterEach` has unstubbed
it. Only in such a file, register the teardown from `beforeEach` instead, so
it is the first `onTestFinished` callback and runs last:

```ts
// Runs after each test's own onTestFinished cleanups, which unsubscribe
// from the stubbed globals.
beforeEach(({ onTestFinished }) => {
  onTestFinished(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
```

Keep `afterEach` everywhere else; do not convert files that do not need it.
