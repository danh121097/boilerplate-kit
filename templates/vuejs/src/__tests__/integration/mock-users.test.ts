import { installLocalStorage } from "@/__tests__/helpers/fake-storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

/**
 * Dev-only mock users API, exercised through the public surface: `UsersModel`
 * on the real axios client with the real interceptors, answered by the mock
 * that also answers auth (`VITE_AUTH_MOCK`). Every test boots a fresh module
 * graph, which is what a page reload does.
 */

const DEMO = { email: "demo@example.com", password: "password" };
const NEW_USER = { email: "new@example.com", password: "password", name: "New User" };
const REAL_LIST = { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } };

async function boot() {
  vi.resetModules();
  const { initServices } = await import("@/services");
  const core = await import("@/services/core");
  const auth = await import("@/services/auth");
  const users = await import("@/services/users");
  initServices();
  return { ...core, ...auth, ...users };
}

describe("mock users", () => {
  beforeEach(() => {
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

    const user = await app.UsersModel.get("mock-user-3");

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
    expect(app.hasStoredSession("MAIN")).toBe(true);
  });

  it("answers 401 without a session", async () => {
    const app = await boot();

    await expect(app.UsersModel.list()).rejects.toMatchObject({
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
    const app = await boot();

    await expect(app.UsersModel.list()).resolves.toEqual(REAL_LIST);
    expect(backend).toHaveBeenCalledTimes(1);
  });
});
