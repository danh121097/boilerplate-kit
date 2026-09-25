import { sanitizeStorageKeyPrefix } from "@/enums/storage-keys";

/** expo-secure-store rejects any key outside this alphabet. */
const SECURE_STORE_KEY = /^[\w.-]+$/;

describe("storage keys", () => {
  it.each([
    ["My App", "My_App"],
    ["  Spaced  Name ", "Spaced__Name"],
    ["acme/app:v2", "acme_app_v2"],
    ["cafe.app-1", "cafe.app-1"],
  ])("sanitizes %j to a SecureStore-legal prefix", (raw, expected) => {
    expect(sanitizeStorageKeyPrefix(raw)).toBe(expected);
  });

  it("falls back to the default prefix when empty or unset", () => {
    expect(sanitizeStorageKeyPrefix(undefined)).toBe("PRISM_APP");
    expect(sanitizeStorageKeyPrefix("   ")).toBe("PRISM_APP");
  });

  it("builds legal keys from a spaced EXPO_PUBLIC_APP_NAME", () => {
    const original = process.env.EXPO_PUBLIC_APP_NAME;
    process.env.EXPO_PUBLIC_APP_NAME = "My Cool App";
    try {
      jest.isolateModules(() => {
        const { STORAGE_KEYS } = require("@/enums/storage-keys");
        expect(STORAGE_KEYS.ACCESS_TOKEN).toBe("My_Cool_App_ACCESS_TOKEN");
        for (const key of Object.values(STORAGE_KEYS) as string[]) {
          expect(key).toMatch(SECURE_STORE_KEY);
        }
      });
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_APP_NAME;
      else process.env.EXPO_PUBLIC_APP_NAME = original;
    }
  });
});
