# Testing

Vitest conventions for test setup and teardown.

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
