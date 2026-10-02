/**
 * Suites run with the dev-only mock auth off, whatever the developer's local
 * env says: `EXPO_PUBLIC_AUTH_MOCK*` can be set in a `.env` file or the shell,
 * and would otherwise turn the mock on under every unrelated suite. The
 * mock-auth tests turn it on explicitly.
 */
beforeEach(() => {
  delete process.env.EXPO_PUBLIC_AUTH_MOCK;
  delete process.env.EXPO_PUBLIC_AUTH_MOCK_EMAIL;
  delete process.env.EXPO_PUBLIC_AUTH_MOCK_PASSWORD;
});

// The install marker the auth store checks on boot: present by default (not a first
// launch). The first-launch suite replaces this with a stateful mock.
jest.mock("expo-file-system", () =>
  require("@/__tests__/helpers/fake-file-system").fakeFileSystem(),
);
