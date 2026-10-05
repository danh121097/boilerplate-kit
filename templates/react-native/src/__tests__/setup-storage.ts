/**
 * Every suite runs against in-memory storage: the encryption key slot in
 * `expo-secure-store` and the encrypted MMKV instance in `react-native-mmkv`
 * (see `helpers/fake-storage.ts`). A suite that needs different behavior calls
 * `jest.mock` for the module itself, which takes precedence over these.
 */
jest.mock("expo-secure-store", () => require("@/__tests__/helpers/fake-storage").fakeSecureStore());
jest.mock("react-native-mmkv", () => require("@/__tests__/helpers/fake-storage").fakeMMKV());
