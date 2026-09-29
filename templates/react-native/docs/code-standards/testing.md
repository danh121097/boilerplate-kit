# Testing

Jest conventions (jest-expo + `@testing-library/react-native`). The web templates use
vitest; jest is forced here by the Expo toolchain. Run: `pnpm test` (`pnpm test:watch`
to watch).

## Layout

- `src/__tests__/unit/` — pure logic (stores, storage, signing, redirect validation, i18n).
- `src/__tests__/integration/` — screens and services through the public surface
  (login, profile, not-found, session banner, interceptors, mock auth).
- `src/__tests__/helpers/` — shared fixtures, not suites (`fake-secure-store`, `http-mocks`).
- `src/__tests__/setup-mock-auth-off.ts` keeps a local `EXPO_PUBLIC_AUTH_MOCK*` from
  turning mock auth on in every suite.

## Conventions

- Mock `expo-secure-store` with `jest.mock("expo-secure-store", () =>
  require("@/__tests__/helpers/fake-secure-store").fakeSecureStore())` and call
  `resetSecureStore()` in `beforeEach`.
- Screen tests mock `expo-router` and `react-i18next` (`t` returns the key), so
  assertions use translation keys, not copy.
- Restore spies and globals in `afterEach` (`jest.restoreAllMocks()`); put listener
  unsubscribes in `afterEach`/`finally`, never on the last line of a test body.
- Drop query-cache GC timers with `queryClient.clear()` in `afterAll` when a suite signs out.
- No simulator or device is needed; `pnpm typecheck` and `pnpm lint` run alongside.
