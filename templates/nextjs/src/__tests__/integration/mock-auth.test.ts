import { installLocalStorage } from "@/__tests__/helpers/session-browser";
import { STORAGE_KEYS } from "@/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Dev-only mock auth, exercised through the public surface: `AuthModel` on the
 * real axios client with the real interceptors, its transport replaced by the
 * mock. Every test boots a fresh module graph (`boot`) over the same cookie jar
 * and localStorage, which is what a page reload does.
 */

const DEMO = { email: "demo@example.com", password: "password" };
const REAL_RESULT = {
  user: { _id: "real", email: "real@example.com", name: "Real", role: "user" },
  tokens: { accessToken: "real-access" },
};

/** A browser cookie jar behind `document.cookie` (name=value; attributes, `max-age=0` deletes). */
function installCookieJar() {
  const jar = new Map<string, string>();
  const noop = () => {};
  vi.stubGlobal("window", { addEventListener: noop, removeEventListener: noop });
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair = "", ...attributes] = raw.split(";");

      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1));
    },
    visibilityState: "visible",
    addEventListener: noop,
    removeEventListener: noop,
  });
  return jar;
}

async function boot() {
  vi.resetModules();
  const { initServices } = await import("@/services/init-services");
  const core = await import("@/services/core");
  const auth = await import("@/services/auth/auth");
  initServices();
  return { ...core, ...auth };
}

describe("mock auth", () => {
  let jar: Map<string, string>;

  beforeEach(() => {
    jar = installCookieJar();
    installLocalStorage();
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "true");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("logs in with the default demo credentials and starts the session like the backend", async () => {
    const app = await boot();
    const result = await app.AuthModel.login(DEMO);

    expect(result.user).toMatchObject({ email: DEMO.email, role: "user" });
    expect(result.tokens.accessToken).toEqual(expect.any(String));
    expect(jar.get(STORAGE_KEYS.SESSION)).toBe("1");
    expect(app.hasSessionHint()).toBe(true);
    await expect(app.AuthModel.getMe()).resolves.toEqual(result.user);
  });

  it("takes the credentials from the env overrides", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK_EMAIL", "dev@example.com");
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK_PASSWORD", "s3cret-pass");
    const app = await boot();

    await expect(app.AuthModel.login(DEMO)).rejects.toMatchObject({ error_code: 401 });
    const result = await app.AuthModel.login({ email: "dev@example.com", password: "s3cret-pass" });
    expect(result.user.email).toBe("dev@example.com");
  });

  it.each(["true", "1"])("treats %j as on", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", value);
    const app = await boot();

    const result = await app.AuthModel.login(DEMO);
    expect(result.user).toMatchObject({ email: DEMO.email, role: "user" });
  });

  it("rejects a wrong password with the backend's 401 and starts no session", async () => {
    const app = await boot();
    const error = await app.AuthModel.login({ ...DEMO, password: "nope-nope" }).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({
      status: "error",
      error_code: 401,
      message: "Invalid email or password!",
    });
    expect(app.getApiErrorMessage(error, "fallback")).toBe("Invalid email or password!");
    expect(jar.size).toBe(0);
  });

  it("keeps the session across a reload", async () => {
    const before = await boot();
    const user = (await before.AuthModel.login(DEMO)).user;

    const after = await boot();
    expect(after.hasSessionHint()).toBe(true);
    await expect(after.AuthModel.getSession()).resolves.toEqual(user);
  });

  it("registers a user who stays signed in", async () => {
    const app = await boot();

    const { user } = await app.AuthModel.register({
      email: "New@Example.com",
      password: "password",
      name: "New User",
    });

    expect(user).toMatchObject({ email: "new@example.com", name: "New User" });
    expect(jar.get(STORAGE_KEYS.SESSION)).toBe("1");
    await expect(app.AuthModel.getMe()).resolves.toEqual(user);
  });

  it("clears the session on logout", async () => {
    const app = await boot();
    await app.AuthModel.login(DEMO);
    await app.AuthModel.logout();

    expect(jar.size).toBe(0);
    expect(app.hasSessionHint()).toBe(false);
    await expect(app.AuthModel.getSession()).resolves.toBeNull();
  });

  it("ends a session the mock can no longer refresh, as a refused refresh would", async () => {
    const app = await boot();
    await app.AuthModel.login(DEMO);
    for (const name of [...jar.keys()]) if (name !== STORAGE_KEYS.SESSION) jar.delete(name);
    const ended = vi.fn();
    app.onSessionEnded(ended);

    await expect(app.AuthModel.getSession()).resolves.toBeNull();
    expect(ended).toHaveBeenCalledWith("expired", "MAIN");
    expect(app.hasSessionHint()).toBe(false);
  });

  describe("when it is not active", () => {
    const backend = vi.fn();

    beforeEach(() => {
      backend.mockReset().mockImplementation((config: { url?: string }) =>
        Promise.resolve({
          data: { success: true, data: REAL_RESULT },
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        }),
      );
      vi.spyOn(axios.defaults, "adapter", "get").mockReturnValue(backend);
    });

    it("ignores the flag in a production build, with one warning", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const app = await boot();

      const first = await app.AuthModel.login(DEMO);
      await app.AuthModel.login(DEMO);

      expect(first).toEqual(REAL_RESULT);
      expect(backend).toHaveBeenCalledTimes(2);
      expect(jar.has(STORAGE_KEYS.SESSION)).toBe(true);
      expect([...jar.keys()].filter((name) => name !== STORAGE_KEYS.SESSION)).toEqual([]);
      const warnings = vi.mocked(console.warn).mock.calls.filter(([m]) => /production/.test(m));
      expect(warnings).toHaveLength(1);
    });

    it("uses the backend when the flag is off", async () => {
      vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "");
      const app = await boot();

      await expect(app.AuthModel.login(DEMO)).resolves.toEqual(REAL_RESULT);
      expect(backend).toHaveBeenCalledTimes(1);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it.each(["TRUE", " true", "true ", "yes", "on", "0"])(
      "treats %j as off: only exactly true or 1 enable the mock",
      async (value) => {
        vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", value);
        const app = await boot();

        await expect(app.AuthModel.login(DEMO)).resolves.toEqual(REAL_RESULT);
        expect(backend).toHaveBeenCalledTimes(1);
      },
    );
  });
});
