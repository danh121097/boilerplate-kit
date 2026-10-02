import type { AuthUser } from "@/services/auth/types/auth";

// State lives in the test file (not a helper module) so it survives `jest.resetModules`,
// which is what an app relaunch does here.
const mockSecureStore = new Map<string, string>();
const mockFiles = new Set<string>();
const mockFailure = { read: false, write: false };

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED: "whenUnlocked",
  getItemAsync: async (key: string) => mockSecureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecureStore.delete(key);
  },
}));

jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: async (path: string) => {
    if (mockFailure.read) throw new Error("read failed");
    return { exists: mockFiles.has(path), isDirectory: false };
  },
  writeAsStringAsync: async (path: string) => {
    if (mockFailure.write) throw new Error("write failed");
    mockFiles.add(path);
  },
}));

const USER = { _id: "u1", email: "a@b.com", name: "A", role: "user" } as AuthUser;

/** One app process: a fresh module graph over the same SecureStore + file system, as a relaunch is. */
function launch() {
  jest.resetModules();
  const storage =
    require("@/services/core/auth-token-storage") as typeof import("@/services/core/auth-token-storage");
  const { AuthModel } = require("@/services/auth") as typeof import("@/services/auth");
  const { useAuthStore } = require("@/stores/auth") as typeof import("@/stores/auth");
  const { queryClient } =
    require("@/providers/query-client-provider") as typeof import("@/providers/query-client-provider");
  jest.spyOn(AuthModel, "getMe").mockResolvedValue(USER);
  return { storage, useAuthStore, queryClient };
}

describe("first launch after an install", () => {
  beforeEach(() => {
    mockSecureStore.clear();
    mockFiles.clear();
    mockFailure.read = false;
    mockFailure.write = false;
  });
  afterEach(() => jest.restoreAllMocks());

  async function seedStaleTokens() {
    const { storage } = launch();
    await storage.persistAccessToken("STALE_AT", "MAIN");
    await storage.persistRefreshToken("STALE_RT", "MAIN");
  }

  it("clears stale Keychain tokens and boots signed out", async () => {
    await seedStaleTokens();
    const { storage, queryClient, useAuthStore } = launch();

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      hydrated: true,
    });
    expect(await storage.getAccessToken("MAIN")).toBeNull();
    expect(await storage.getRefreshToken("MAIN")).toBeNull();
    queryClient.clear();
  });

  it("keeps the tokens on a normal relaunch", async () => {
    await seedStaleTokens();
    const first = launch();
    await first.useAuthStore.getState().hydrate(); // first launch writes the marker, clears
    await first.storage.persistAccessToken("AT", "MAIN");
    await first.storage.persistRefreshToken("RT", "MAIN");
    first.queryClient.clear();

    const { storage, queryClient, useAuthStore } = launch();
    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState()).toMatchObject({ user: USER, isAuthenticated: true });
    expect(await storage.getAccessToken("MAIN")).toBe("AT");
    expect(await storage.getRefreshToken("MAIN")).toBe("RT");
    queryClient.clear();
  });

  it("keeps the session when the marker cannot be read", async () => {
    await seedStaleTokens();
    mockFailure.read = true;
    const { storage, queryClient, useAuthStore } = launch();

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(await storage.getRefreshToken("MAIN")).toBe("STALE_RT");
    queryClient.clear();
  });

  it("keeps the session when the marker cannot be written, so a failing disk never signs out every launch", async () => {
    await seedStaleTokens();
    mockFailure.write = true;
    const { storage, queryClient, useAuthStore } = launch();

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(await storage.getRefreshToken("MAIN")).toBe("STALE_RT");
    queryClient.clear();
  });
});
