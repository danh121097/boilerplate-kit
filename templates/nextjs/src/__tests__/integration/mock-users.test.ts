import { installLocalStorage } from "@/__tests__/helpers/session-browser";
import { getUsersServerData } from "@/server/get-users";
import { MOCK_USER_COOKIE } from "@/services/auth/data/mock-auth-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/services/users";
import axios from "axios";

/**
 * Dev-only mock users API, exercised through the public surface: `UsersModel`
 * on the real axios client with the real interceptors, answered by the mock
 * that also answers auth (`NEXT_PUBLIC_AUTH_MOCK`), plus the server-side users
 * read the `/users` page prefetches with. Every browser test boots a fresh
 * module graph, which is what a page reload does.
 */

const DEMO = { email: "demo@example.com", password: "password" };
const NEW_USER = { email: "new@example.com", password: "password", name: "New User" };
const REAL_LIST = { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } };

/** Cookies the server request carries (what `next/headers` `cookies()` reads). */
const requestCookies = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      requestCookies.has(name) ? { name, value: requestCookies.get(name)! } : undefined,
  }),
}));

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
  const users = await import("@/services/users");
  initServices();
  return { ...core, ...auth, ...users };
}

describe("mock users", () => {
  let jar: Map<string, string>;

  beforeEach(() => {
    jar = installCookieJar();
    installLocalStorage();
    requestCookies.clear();
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "true");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists users as admin", async () => {
    const app = await boot();
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
  });

  it("paginates with page and limit like the backend", async () => {
    const app = await boot();
    await app.AuthModel.login(DEMO);

    const body = await app.UsersModel.list({ page: 2, limit: 4 });

    expect(body.data.map((u) => u._id)).toEqual(["mock-user-2", "mock-user-1"]);
    expect(body).toMatchObject({
      meta: { page: 2, limit: 4, total: 6, totalPages: 2, hasNext: false, hasPrev: true },
    });
  });

  it("returns one user by id", async () => {
    const app = await boot();
    await app.AuthModel.login(DEMO);

    const user: User = await app.UsersModel.get("mock-user-3");

    expect(user).toMatchObject({
      _id: "mock-user-3",
      name: "Carol Silva",
      email: "carol.silva@example.com",
      role: "admin",
    });
  });

  it("answers 404 for an unknown id", async () => {
    const app = await boot();
    await app.AuthModel.login(DEMO);

    await expect(app.UsersModel.get("nobody")).rejects.toMatchObject({
      status: "error",
      error_code: 404,
      message: "User not found!",
    });
  });

  it("answers 403 for a non-admin registered user", async () => {
    const app = await boot();
    await app.AuthModel.register(NEW_USER);

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 403,
      message: "Insufficient permissions!",
    });
    await expect(app.UsersModel.get("mock-user-1")).rejects.toMatchObject({ error_code: 403 });
    expect(app.hasSessionHint()).toBe(true);
  });

  it("answers 401 without a session", async () => {
    const app = await boot();

    await expect(app.UsersModel.list()).rejects.toMatchObject({
      error_code: 401,
      message: "Access token required!",
    });
  });

  it("uses the backend when the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MOCK", "");
    const backend = vi
      .fn()
      .mockImplementation((config: { url?: string }) =>
        Promise.resolve({ data: REAL_LIST, status: 200, statusText: "OK", headers: {}, config }),
      );
    vi.spyOn(axios.defaults, "adapter", "get").mockReturnValue(backend);
    const app = await boot();

    await expect(app.UsersModel.list()).resolves.toEqual(REAL_LIST);
    expect(backend).toHaveBeenCalledTimes(1);
  });

  describe("server-side fetch", () => {
    /** The mock cookie a login leaves in the browser, as the request carries it (URI-decoded). */
    async function signedInCookie() {
      const app = await boot();
      await app.AuthModel.login(DEMO);
      return decodeURIComponent(jar.get(MOCK_USER_COOKIE)!);
    }

    it("answers the server-side fetch in dev", async () => {
      const cookie = await signedInCookie();
      requestCookies.set(MOCK_USER_COOKIE, cookie);
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const body = await getUsersServerData();
      expect(body.data).toHaveLength(6);
      expect(body.meta).toMatchObject({ page: 1, limit: 20, total: 6 });
      expect(body.data[0]).toMatchObject({ _id: "mock-user", role: "admin" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("rejects like a backend failure without a session or below admin", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const anonymous = await getUsersServerData().catch((e: unknown) => e);
      expect(anonymous).toMatchObject({
        status: "error",
        error_code: 401,
        message: "Access token required!",
      });
      expect(anonymous).not.toHaveProperty("retryable");

      const plain = { _id: "u1", email: "u@example.com", name: "U", role: "user" };
      requestCookies.set(MOCK_USER_COOKIE, JSON.stringify(plain));
      await expect(getUsersServerData()).rejects.toMatchObject({
        error_code: 403,
        message: "Insufficient permissions!",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("does not answer the server-side fetch in production", async () => {
      const cookie = await signedInCookie();
      requestCookies.set(MOCK_USER_COOKIE, cookie);
      vi.stubEnv("NODE_ENV", "production");
      const fetchSpy = vi.fn().mockResolvedValue(Response.json(REAL_LIST));
      vi.stubGlobal("fetch", fetchSpy);

      // No httpOnly access cookie: the real path rejects 401 without any request.
      await expect(getUsersServerData()).rejects.toMatchObject({ error_code: 401 });
      requestCookies.set("accessToken", "AT");
      await expect(getUsersServerData()).resolves.toEqual(REAL_LIST);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
