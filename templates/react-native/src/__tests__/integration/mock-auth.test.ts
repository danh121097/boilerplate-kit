import type { AxiosRequestConfig } from "axios";

/**
 * Dev-only mock auth, exercised through the public surface: `AuthModel` on the
 * real axios client with the real interceptors, its transport replaced by the
 * mock. Every test boots a fresh module graph (`boot`) over the same SecureStore
 * contents, which is what an app restart does.
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
const REAL_RESULT = {
  user: { _id: "real", email: "real@example.com", name: "Real", role: "user" },
  tokens: { accessToken: "real-access", refreshToken: "real-refresh" },
};
const setDev = (value: boolean) => Object.assign(globalThis, { __DEV__: value });

/** Stands in for the network: answers every request with `REAL_RESULT`. */
const backend = jest.fn((config: AxiosRequestConfig) =>
  Promise.resolve({
    data: { success: true, data: REAL_RESULT },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }),
);

function boot() {
  jest.resetModules();
  // Set before the auth client is built: it copies axios's default adapter then.
  const axios = (require("axios") as typeof import("axios")).default;
  axios.defaults.adapter = backend as never;
  const { initServices } = require("@/services") as typeof import("@/services");
  const core = require("@/services/core") as typeof import("@/services/core");
  const auth = require("@/services/auth") as typeof import("@/services/auth");
  initServices();
  return { ...core, ...auth };
}

describe("mock auth", () => {
  beforeEach(() => {
    mockSecureStore.clear();
    backend.mockClear();
    setDev(true);
    process.env.EXPO_PUBLIC_AUTH_MOCK = "true";
    delete process.env.EXPO_PUBLIC_AUTH_MOCK_EMAIL;
    delete process.env.EXPO_PUBLIC_AUTH_MOCK_PASSWORD;
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    setDev(true);
    delete process.env.EXPO_PUBLIC_AUTH_MOCK;
    delete process.env.EXPO_PUBLIC_AUTH_MOCK_EMAIL;
    delete process.env.EXPO_PUBLIC_AUTH_MOCK_PASSWORD;
  });

  it("logs in with the default demo credentials and starts the session like the backend", async () => {
    const app = boot();
    const result = await app.AuthModel.login(DEMO);

    expect(result.user).toMatchObject({ email: DEMO.email, role: "user" });
    await expect(app.getAccessToken("MAIN")).resolves.toBe(result.tokens.accessToken);
    await expect(app.getRefreshToken("MAIN")).resolves.toBe(result.tokens.refreshToken);
    await expect(app.AuthModel.getMe()).resolves.toEqual(result.user);
    expect(backend).not.toHaveBeenCalled();
  });

  it("takes the credentials from the env overrides", async () => {
    process.env.EXPO_PUBLIC_AUTH_MOCK_EMAIL = "dev@example.com";
    process.env.EXPO_PUBLIC_AUTH_MOCK_PASSWORD = "s3cret-pass";
    const app = boot();

    await expect(app.AuthModel.login(DEMO)).rejects.toMatchObject({ error_code: 401 });
    const result = await app.AuthModel.login({ email: "dev@example.com", password: "s3cret-pass" });
    expect(result.user.email).toBe("dev@example.com");
  });

  it.each(["true", "1"])("treats %j as on", async (value) => {
    process.env.EXPO_PUBLIC_AUTH_MOCK = value;
    const app = boot();

    const result = await app.AuthModel.login(DEMO);
    expect(result.user).toMatchObject({ email: DEMO.email, role: "user" });
    expect(backend).not.toHaveBeenCalled();
  });

  it("rejects a wrong password with the backend's 401 and starts no session", async () => {
    const app = boot();
    const error = await app.AuthModel.login({ ...DEMO, password: "nope-nope" }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      status: "error",
      error_code: 401,
      message: "Invalid email or password!",
    });
    expect(app.getApiErrorMessage(error, "fallback")).toBe("Invalid email or password!");
    await expect(app.hasStoredSession("MAIN")).resolves.toBe(false);
  });

  it("keeps the session across an app restart", async () => {
    const before = boot();
    const user = (await before.AuthModel.login(DEMO)).user;

    const after = boot();
    await expect(after.hasStoredSession("MAIN")).resolves.toBe(true);
    await expect(after.AuthModel.getSession()).resolves.toEqual(user);
  });

  it("refreshes an expired access token through the mock and replays the request", async () => {
    const app = boot();

    const { user, tokens } = await app.AuthModel.login(DEMO);
    await app.persistAccessToken("expired", "MAIN");

    await expect(app.AuthModel.getMe()).resolves.toEqual(user);
    expect(await app.getAccessToken("MAIN")).not.toBe("expired");
    expect(await app.getRefreshToken("MAIN")).not.toBe(tokens.refreshToken); // rotated
  });

  it("registers a user who stays signed in", async () => {
    const app = boot();

    const { user } = await app.AuthModel.register({
      email: "New@Example.com",
      password: "password",
      name: "New User",
    });

    expect(user).toMatchObject({
      _id: "mock-new@example.com",
      email: "new@example.com",
      name: "New User",
    });
    await expect(app.AuthModel.getMe()).resolves.toEqual(user);
  });

  it("clears the session on logout", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);
    await app.AuthModel.logout();

    await expect(app.hasStoredSession("MAIN")).resolves.toBe(false);
    await expect(app.AuthModel.getSession()).resolves.toBeNull();
  });

  it("ends a session the mock can no longer refresh, as a refused refresh would", async () => {
    const app = boot();
    await app.AuthModel.login(DEMO);
    await app.persistAccessToken("expired", "MAIN");
    await app.persistRefreshToken("garbage", "MAIN");
    const ended = jest.fn();
    app.onSessionEnded(ended);

    await expect(app.AuthModel.getSession()).resolves.toBeNull();
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    await expect(app.hasStoredSession("MAIN")).resolves.toBe(false);
  });

  describe("when it is not active", () => {
    it("ignores the flag in a production build, with one warning", async () => {
      setDev(false);
      const app = boot();

      const first = await app.AuthModel.login(DEMO);
      await app.AuthModel.login(DEMO);

      expect(first).toEqual(REAL_RESULT);
      expect(backend).toHaveBeenCalledTimes(2);
      const warnings = jest.mocked(console.warn).mock.calls.filter(([m]) => /production/.test(m));
      expect(warnings).toHaveLength(1);
    });

    it("uses the backend when the flag is off", async () => {
      process.env.EXPO_PUBLIC_AUTH_MOCK = "";
      const app = boot();

      await expect(app.AuthModel.login(DEMO)).resolves.toEqual(REAL_RESULT);
      expect(backend).toHaveBeenCalledTimes(1);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it.each(["TRUE", " true", "true ", "yes", "on", "0"])(
      "treats %j as off: only exactly true or 1 enable the mock",
      async (value) => {
        process.env.EXPO_PUBLIC_AUTH_MOCK = value;
        const app = boot();

        await expect(app.AuthModel.login(DEMO)).resolves.toEqual(REAL_RESULT);
        expect(backend).toHaveBeenCalledTimes(1);
      },
    );
  });
});
