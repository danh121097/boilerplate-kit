import { installCookieJar } from "@/__tests__/helpers/cookie-jar";
import { installLocalStorage } from "@/__tests__/helpers/session-browser";
import { STORAGE_KEYS } from "@/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/services/users";
import axios from "axios";

/**
 * Dev-only mock users API, exercised through the public surface: `UsersModel`
 * on the real axios client with the real interceptors, answered by the mock
 * that also answers auth (`VITE_AUTH_MOCK`), and the server function the users
 * route's SSR prefetch runs. The session is the mock cookie, sent to the SSR
 * server with every page request. Every test boots a fresh module graph, which
 * is what a page reload does.
 */

const DEMO = { email: "demo@example.com", password: "password" };
const NEW_USER = { email: "new@example.com", password: "password", name: "New User" };
const REAL_LIST = { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } };

/** The request cookies the SSR server sees — what the browser sends on a page load. */
const requestCookies = vi.hoisted(() => new Map<string, string>());
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => requestCookies.get(name),
}));
// Outside the framework's build, a server function is its handler.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: unknown) => fn }),
}));

async function boot(jar: Map<string, string>) {
  vi.resetModules();
  requestCookies.clear();
  for (const [name, value] of jar) requestCookies.set(name, decodeURIComponent(value));
  const { initServices } = await import("@/services");
  const core = await import("@/services/core");
  const auth = await import("@/services/auth/auth");
  const users = await import("@/services/users");
  const { getUsersServerFn } = await import("@/server/get-users");
  initServices();
  return { ...core, ...auth, ...users, getUsers: getUsersServerFn as () => Promise<unknown> };
}

describe("mock users", () => {
  let jar: Map<string, string>;

  beforeEach(() => {
    jar = installCookieJar();
    installLocalStorage();
    vi.stubEnv("VITE_AUTH_MOCK", "true");
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

    const body = await app.UsersModel.api.get<User[]>({ url: "/users" });

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
  });

  it("paginates with page and limit like the backend", async () => {
    const app = await boot(jar);
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.api.get<User[]>({
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

    await expect(app.UsersModel.api.get<User[]>({ url: "/users" })).rejects.toMatchObject({
      error_code: 403,
      message: "Insufficient permissions!",
    });
    await expect(app.UsersModel.get("mock-user-1")).rejects.toMatchObject({ error_code: 403 });
    expect(app.hasSessionHint()).toBe(true);
  });

  it("answers 401 without a session", async () => {
    const app = await boot(jar);

    await expect(app.UsersModel.get("mock-user-1")).rejects.toMatchObject({
      error_code: 401,
      message: "Access token required!",
    });
  });

  it("uses the backend when the flag is off", async () => {
    vi.stubEnv("VITE_AUTH_MOCK", "");
    const backend = vi
      .fn()
      .mockImplementation((config: { url?: string }) =>
        Promise.resolve({ data: REAL_LIST, status: 200, statusText: "OK", headers: {}, config }),
      );
    vi.spyOn(axios.defaults, "adapter", "get").mockReturnValue(backend);
    const app = await boot(jar);

    await expect(app.UsersModel.api.get<User[]>({ url: "/users" })).resolves.toEqual(REAL_LIST);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  describe("server-side fetch (the users route's SSR prefetch)", () => {
    it("answers the server-side fetch in dev", async () => {
      const signedIn = await boot(jar);
      await signedIn.AuthModel.login(DEMO);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const app = await boot(jar);

      const body = await app.getUsers();

      expect(body).toMatchObject({
        success: true,
        meta: { page: 1, limit: 20, total: 6, hasNext: false },
      });
      expect((body as { data: User[] }).data.map((u) => u._id)).toEqual([
        "mock-user",
        "mock-user-5",
        "mock-user-4",
        "mock-user-3",
        "mock-user-2",
        "mock-user-1",
      ]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("asks the browser to refresh a hinted session with no mock cookie", async () => {
      jar.set(STORAGE_KEYS.SESSION, "1");
      const app = await boot(jar);

      await expect(app.getUsers()).resolves.toEqual({ unauthorized: true, hasSession: true });
    });

    it("rejects a non-admin session like a backend 403", async () => {
      const signedIn = await boot(jar);
      await signedIn.AuthModel.register(NEW_USER);
      const app = await boot(jar);

      await expect(app.getUsers()).rejects.toMatchObject({
        error_code: 403,
        message: "Insufficient permissions!",
      });
    });

    it("does not answer the server-side fetch in production", async () => {
      const signedIn = await boot(jar);
      await signedIn.AuthModel.login(DEMO);
      jar.set("accessToken", "AT");
      vi.stubEnv("PROD", true);
      const fetchSpy = vi.fn().mockResolvedValue(Response.json(REAL_LIST));
      vi.stubGlobal("fetch", fetchSpy);
      const app = await boot(jar);

      await expect(app.getUsers()).resolves.toEqual(REAL_LIST);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]![0])).toContain("/users");
    });
  });
});
