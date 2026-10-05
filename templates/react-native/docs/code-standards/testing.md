# Testing

Jest conventions (jest-expo + `@testing-library/react-native`). The web templates use
vitest; jest is forced here by the Expo toolchain. Run: `pnpm test` (`pnpm test:watch`
to watch).

## Layout

- `src/__tests__/unit/` — pure logic (stores, storage, signing, redirect validation, i18n).
- `src/__tests__/integration/` — screens and services through the public surface
  (login, profile, not-found, session banner, interceptors, mock auth).
- `src/__tests__/helpers/` — shared fixtures, not suites (`fake-storage`, `http-mocks`).
- `src/__tests__/setup-storage.ts` registers in-memory `expo-secure-store` + `react-native-mmkv`
  fakes for every suite (`react-native-mmkv`'s built-in jest mock is a fresh store per instance, so it cannot model a relaunch).
- `src/__tests__/setup-mock-auth-off.ts` keeps a local `EXPO_PUBLIC_AUTH_MOCK*` from
  turning mock auth on in every suite.

## Conventions

- Storage is faked globally: call `resetStorage()` (from `helpers/fake-storage`) in `beforeEach`.
  A suite that simulates an app relaunch with `jest.resetModules()` keeps its own
  `createStorageState()` in the test file and mocks both modules itself
  (`fakeSecureStore(state)`, `fakeMMKV(state)`), as `mock-auth.test.ts` does.
- To make a storage read fail, spy on the instance: `jest.spyOn(getAppStorage(), "getString")`.
- Screen tests mock `expo-router` and `react-i18next` (`t` returns the key), so
  assertions use translation keys, not copy.
- Restore spies and globals in `afterEach` (`jest.restoreAllMocks()`); put listener
  unsubscribes in `afterEach`/`finally`, never on the last line of a test body.
- Drop query-cache GC timers with `queryClient.clear()` in `afterAll` when a suite signs out.
- No simulator or device is needed; `pnpm typecheck` and `pnpm lint` run alongside.
