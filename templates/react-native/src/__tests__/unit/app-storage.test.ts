import { createStorageState } from "@/__tests__/helpers/fake-storage";
import { APP_PREFIX } from "@/enums";

// State lives in the test file (not a helper module) so it survives `jest.resetModules`,
// which is what an app relaunch does here.
const mockStorage = createStorageState();
jest.mock("expo-secure-store", () => {
  const fake = require("@/__tests__/helpers/fake-storage").fakeSecureStore(mockStorage);
  // A mock fn (not the plain function) so a test can make one read fail.
  return { ...fake, getItem: jest.fn(fake.getItem) };
});
jest.mock("react-native-mmkv", () =>
  require("@/__tests__/helpers/fake-storage").fakeMMKV(mockStorage),
);

// The persisted names: changing either orphans an installed app's data.
const KEY_SLOT = `${APP_PREFIX}_STORAGE_KEY`;
const FILE_ID = `${APP_PREFIX}_storage`;

/** One app process: a fresh module graph over the same Keychain + MMKV files. */
function launch() {
  jest.resetModules();
  const { getAppStorage } =
    require("@/services/core/app-storage") as typeof import("@/services/core/app-storage");
  const SecureStore = require("expo-secure-store") as typeof import("expo-secure-store");
  return { getAppStorage, SecureStore };
}

describe("app storage", () => {
  beforeEach(() => {
    mockStorage.secure.clear();
    mockStorage.files.clear();
    mockStorage.fileKeys.clear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("encrypts with a random key kept in the secure store and reuses it on relaunch", () => {
    launch().getAppStorage().set("token", "T");

    const key = mockStorage.secure.get(KEY_SLOT);
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(mockStorage.fileKeys.get(FILE_ID)).toBe(key);

    expect(launch().getAppStorage().getString("token")).toBe("T");
    expect(mockStorage.secure.get(KEY_SLOT)).toBe(key);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-key"],
  ])("drops the undecryptable file and starts over when the key is %s", (_label, stored) => {
    mockStorage.files.set(FILE_ID, new Map([["token", "STALE"]]));
    if (stored) mockStorage.secure.set(KEY_SLOT, stored);

    const storage = launch().getAppStorage();

    expect(storage.getString("token")).toBeUndefined();
    expect(mockStorage.secure.get(KEY_SLOT)).toMatch(/^[0-9a-f]{32}$/);
    expect(mockStorage.fileKeys.get(FILE_ID)).toBe(mockStorage.secure.get(KEY_SLOT));
  });

  it("never replaces the key or the data when the key cannot be read, and retries", () => {
    launch().getAppStorage().set("token", "T");
    const key = mockStorage.secure.get(KEY_SLOT);

    const { SecureStore, getAppStorage } = launch();
    jest.mocked(SecureStore.getItem).mockImplementationOnce(() => {
      throw new Error("keychain locked");
    });

    expect(() => getAppStorage()).toThrow("keychain locked");
    expect(mockStorage.secure.get(KEY_SLOT)).toBe(key);

    expect(getAppStorage().getString("token")).toBe("T"); // the failure was not cached
  });
});
