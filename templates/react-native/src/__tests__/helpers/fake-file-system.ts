/**
 * Default `expo-file-system` mock (installed in `setup-mock-auth-off.ts`): the
 * install marker the auth store checks on boot always exists, i.e. "not a first
 * launch", so suites that boot the store never see their tokens cleared. The
 * first-launch suite replaces it with its own stateful mock.
 */
export function fakeFileSystem() {
  return {
    documentDirectory: "file:///documents/",
    getInfoAsync: async () => ({ exists: true, isDirectory: false }),
    writeAsStringAsync: async () => {},
  };
}
