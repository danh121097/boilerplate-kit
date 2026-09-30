import type { AxiosRequestConfig } from "axios";

/**
 * Dev-only mock users API, exercised through the public surface: `UsersModel`
 * on the real axios client with the real interceptors, answered by the mock
 * that also answers auth (`EXPO_PUBLIC_AUTH_MOCK`). Every test boots a fresh
 * module graph, which is what an app restart does.
 */

// Lives in the test file (not the shared fake) so it survives `jest.resetModules`.
const mockSecureStore = new Map<string, string>();
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

const DEMO = { email: "demo@example.com", password: "password" };
const NEW_USER = { email: "new@example.com", password: "password", name: "New User" };
const REAL_LIST = { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } };

/** Stands in for the network: answers every request with `REAL_LIST`. */
const backend = jest.fn((config: AxiosRequestConfig) =>
  Promise.resolve({ data: REAL_LIST, status: 200, statusText: "OK", headers: {}, config }),
);

function boot() {
  jest.resetModules();
  // Set before the clients are built: they copy axios's default adapter then.
  const axios = (require("axios") as typeof import("axios")).default;
  axios.defaults.adapter = backend as never;
  const { initServices } = require("@/services") as typeof import("@/services");
  const core = require("@/services/core") as typeof import("@/services/core");
  const auth = require("@/services/auth") as typeof import("@/services/auth");
  const users = require("@/services/users") as typeof import("@/services/users");
  initServices();
  return { ...core, ...auth, ...users };
}

describe("mock users", () => {
  beforeEach(() => {
    mockSecureStore.clear();
    backend.mockClear();
    Object.assign(globalThis, { __DEV__: true });
    process.env.EXPO_PUBLIC_AUTH_MOCK = "true";
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    Object.assign(globalThis, { __DEV__: true });
    delete process.env.EXPO_PUBLIC_AUTH_MOCK;
  });

  it("lists users as admin", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.list();

    expect(body).toMatchObject({
      success: true,
      meta: { page: 1, limit: 20, total: 6, totalPages: 1, hasNext: false, hasPrev: false },
    });
    expect(body.data).toHaveLength(6);
    expect(body.data[0]).toEqual({
      _id: "mock-user",
      email: DEMO.email,
      name: "Demo User",
      role: "admin",
      isActive: true,
      createdAt: "2026-03-02T08:00:00.000Z",
      updatedAt: "2026-03-02T08:00:00.000Z",
    });
    expect(body.data.map((u) => u._id)).toEqual([
      "mock-user",
      "mock-user-5",
      "mock-user-4",
      "mock-user-3",
      "mock-user-2",
      "mock-user-1",
    ]);
    expect(JSON.stringify(body)).not.toContain("password");
    expect(backend).not.toHaveBeenCalled();
  });

  it("paginates with page and limit like the backend", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.list({ page: 2, limit: 4 });

    expect(body.data.map((u) => u._id)).toEqual(["mock-user-2", "mock-user-1"]);
    expect(body).toMatchObject({
      meta: { page: 2, limit: 4, total: 6, totalPages: 2, hasNext: false, hasPrev: true },
    });
  });

  it("returns one user by id", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);

    const user = await app.UsersModel.get("mock-user-3");

    expect(user).toMatchObject({
      _id: "mock-user-3",
      name: "Carol Silva",
      email: "carol.silva@example.com",
      role: "admin",
    });
  });

  it("answers 404 for an unknown id", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);

    await expect(app.UsersModel.get("nobody")).rejects.toMatchObject({
      status: "error",
      error_code: 404,
      message: "User not found!",
    });
  });

  it("answers 403 for a non-admin registered user", async () => {
    const app = boot();
    await app.AuthModel.register(NEW_USER);

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 403,
      message: "Insufficient permissions!",
    });
    await expect(app.UsersModel.get("mock-user-1")).rejects.toMatchObject({ error_code: 403 });
    await expect(app.hasStoredSession("MAIN")).resolves.toBe(true);
  });

  it("answers 401 without a session", async () => {
    const app = boot();

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 401,
      message: "Access token required!",
    });
  });

  it("uses the backend when the flag is off", async () => {
    process.env.EXPO_PUBLIC_AUTH_MOCK = "";
    const app = boot();

    await expect(app.UsersModel.list()).resolves.toEqual(REAL_LIST);
    expect(backend).toHaveBeenCalledTimes(1);
  });
});
