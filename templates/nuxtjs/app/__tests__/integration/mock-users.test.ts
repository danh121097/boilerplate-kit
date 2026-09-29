import { installCookieJar, installLocalStorage } from "@/__tests__/helpers/fake-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/services/users";
import axios from "axios";

/**
 * Dev-only mock users API, exercised through the public surface: `UsersModel`
 * on the real axios client with the real interceptors (browser) and the SSR list
 * fetch the users query relies on, both answered by the mock that also answers
 * auth (`NUXT_PUBLIC_AUTH_MOCK`). Every test boots a fresh module graph, which is
 * what a page reload does.
 */

const DEMO = { email: "demo@example.com", password: "password" };
const NEW_USER = { email: "new@example.com", password: "password", name: "New User" };
const REAL_LIST = { status: "success", data: [], meta: { page: 1, limit: 20, total: 0 } };

/** A page load: fresh modules, the Nuxt globals, the server's view of the request cookies, the boot plugin. */
async function boot(jar: Map<string, string>, authMock: unknown = "true") {
  vi.resetModules();
  vi.stubGlobal("defineNuxtPlugin", (fn: () => void) => fn);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appEndpoint: "http://api.test", apiPrefix: "/api/v1", appName: "", authMock },
  }));
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  vi.stubGlobal("useRequestHeaders", () => (cookie ? { cookie } : {}));
  const fetchSpy = vi.fn();
  vi.stubGlobal("$fetch", fetchSpy);

  const plugin = (await import("@/plugins/01.init-services")).default as unknown as () => void;
  const core = await import("@/services/core");
  const auth = await import("@/services/auth");
  const users = await import("@/services/users");
  plugin();
  return { ...core, ...auth, ...users, fetchSpy };
}

describe("mock users", () => {
  let jar: Map<string, string>;

  beforeEach(() => {
    jar = installCookieJar();
    installLocalStorage();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists users as admin", async () => {
    const app = await boot(jar);
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.list();

    expect(body).toMatchObject({
      status: "success",
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
  });

  it("paginates with page and limit like the backend", async () => {
    const app = await boot(jar);
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.api.paginate<User>({
      url: "/users",
      params: { page: 2, limit: 4 },
    });

    expect(body.data.map((u) => u._id)).toEqual(["mock-user-2", "mock-user-1"]);
    expect(body).toMatchObject({
      meta: { page: 2, limit: 4, total: 6, totalPages: 2, hasNext: false, hasPrev: true },
    });
  });

  it("returns one user by id", async () => {
    const app = await boot(jar);
    await app.AuthModel.login(DEMO);

    await expect(app.UsersModel.get("mock-user-3")).resolves.toMatchObject({
      _id: "mock-user-3",
      name: "Carol Silva",
      email: "carol.silva@example.com",
      role: "admin",
    });
  });

  it("answers 404 for an unknown id", async () => {
    const app = await boot(jar);
    await app.AuthModel.login(DEMO);

    await expect(app.UsersModel.get("nobody")).rejects.toMatchObject({
      status: "error",
      error_code: 404,
      message: "User not found!",
    });
  });

  it("answers 403 for a non-admin registered user", async () => {
    const app = await boot(jar);
    await app.AuthModel.register(NEW_USER);

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 403,
      message: "Insufficient permissions!",
    });
    await expect(app.UsersModel.get("mock-user-1")).rejects.toMatchObject({ error_code: 403 });
    expect(app.hasSessionHint()).toBe(true);
  });

  it("answers 401 without a session", async () => {
    const app = await boot(jar);

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 401,
      message: "Access token required!",
    });
  });

  it("uses the backend when the flag is off", async () => {
    const backend = vi
      .fn()
      .mockImplementation((config: { url?: string }) =>
        Promise.resolve({ data: REAL_LIST, status: 200, statusText: "OK", headers: {}, config }),
      );
    vi.spyOn(axios.defaults, "adapter", "get").mockReturnValue(backend);
    const app = await boot(jar, "");

    await expect(app.UsersModel.list()).resolves.toEqual(REAL_LIST);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  describe("server-side fetch", () => {
    it("answers the server-side fetch in dev", async () => {
      const browser = await boot(jar);
      await browser.AuthModel.login(DEMO);
      const server = await boot(jar);

      const body = await server.fetchUsersOnServer();

      expect(body).toMatchObject({ status: "success", meta: { page: 1, limit: 20, total: 6 } });
      expect(body.data[0]).toMatchObject({ _id: "mock-user", role: "admin" });
      expect(server.fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects with the backend's error shape for a request without a session or below admin", async () => {
      const anonymous = await boot(jar);
      await expect(anonymous.fetchUsersOnServer()).rejects.toMatchObject({
        status: "error",
        error_code: 401,
        message: "Access token required!",
        error_message: "Access token required!",
      });

      const browser = await boot(jar);
      await browser.AuthModel.register(NEW_USER);
      const server = await boot(jar);
      await expect(server.fetchUsersOnServer()).rejects.toMatchObject({
        status: "error",
        error_code: 403,
        message: "Insufficient permissions!",
      });
      expect(server.fetchSpy).not.toHaveBeenCalled();
    });

    it("does not answer the server-side fetch in production", async () => {
      const browser = await boot(jar);
      await browser.AuthModel.login(DEMO);
      vi.stubEnv("PROD", true);
      const server = await boot(jar);
      server.fetchSpy.mockResolvedValue(REAL_LIST);

      await expect(server.fetchUsersOnServer()).resolves.toEqual(REAL_LIST);
      expect(server.fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
