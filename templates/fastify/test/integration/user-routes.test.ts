import { buildApp } from "@/app";
import { User } from "@/models/user";
import { serializeUser } from "@/modules/user/serialize-user";
import { createTestUser } from "../helpers/create-test-user";
import { API, createSignedRequest } from "../helpers/signed-request";
import type { FastifyInstance } from "fastify";

describe("User routes", () => {
  let app: FastifyInstance;
  let signedRequest: ReturnType<typeof createSignedRequest>;

  beforeAll(async () => {
    app = buildApp({ sockets: false });
    await app.ready();
    signedRequest = createSignedRequest(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const url = `${API}/users`;

  /** Admin token (list is admin-and-above) plus N extra regular users. */
  const setup = async (extraUsers: number) => {
    const { user, accessToken } = await createTestUser({
      email: "admin@test.com",
      role: "admin",
    });
    if (extraUsers > 0) {
      await User.insertMany(
        Array.from({ length: extraUsers }, (_, i) => ({
          email: `u${i}@test.com`,
          password: "Password1!",
          name: `User ${i}`,
          role: "user",
        })),
      );
    }
    return { admin: user, token: accessToken };
  };

  const get = (path: string, token?: string) =>
    signedRequest({
      method: "GET",
      url: `${url}${path}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  describe("GET /users (offset pagination)", () => {
    it("returns the first page with meta and respects limit", async () => {
      const { token } = await setup(24); // 24 + admin = 25 total
      const res = await get("?page=1&limit=20", token);

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data).toHaveLength(20);
      expect(res.json().meta).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
        hasNext: true,
        hasPrev: false,
      });
    });

    it("returns the remainder on the last page", async () => {
      const { token } = await setup(24);
      const res = await get("?page=2&limit=20", token);

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(5);
      expect(res.json().meta.hasNext).toBe(false);
      expect(res.json().meta.hasPrev).toBe(true);
    });

    it("defaults to page 1 / limit 20 when there are no query params", async () => {
      const { token } = await setup(0);
      const res = await get("", token);

      expect(res.statusCode).toBe(200);
      expect(res.json().meta).toMatchObject({ page: 1, limit: 20, total: 1 });
    });

    it("clamps an over-large limit to 100", async () => {
      const { token } = await setup(0);
      expect((await get("?limit=9999", token)).json().meta.limit).toBe(100);
    });

    it("serializes every user through serializeUser and never leaks the password", async () => {
      const { token } = await setup(2);
      const res = await get("", token);
      const stored = await User.find().sort({ _id: -1 });

      expect(res.json().data).toEqual(stored.map((u) => serializeUser(u)));
      for (const listed of res.json().data) expect(listed).not.toHaveProperty("password");
    });

    it("rejects a non-admin user with 403", async () => {
      const { accessToken } = await createTestUser({ email: "plain@test.com", role: "user" });
      const res = await get("", accessToken);
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, errorType: "AUTHORIZATION_ERROR" });
    });

    it("rejects an unauthenticated (but signed) request with 401", async () => {
      const res = await get("");
      expect(res.statusCode).toBe(401);
      expect(res.json().errorType).toBe("AUTHENTICATION_ERROR");
    });

    it("rejects a request without HMAC with 401", async () => {
      const { accessToken } = await createTestUser({ email: "admin2@test.com", role: "admin" });
      const res = await app.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /users/:id", () => {
    it("returns the serialized user in the success envelope", async () => {
      const { admin, token } = await setup(0);
      const res = await get(`/${admin.id}`, token);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true, data: serializeUser(admin) });
      expect(res.json().data).not.toHaveProperty("password");
    });

    it("404 NOT_FOUND for an unknown id", async () => {
      const { token } = await setup(0);
      const res = await get("/000000000000000000000000", token);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ success: false, errorType: "NOT_FOUND" });
    });

    it("400 VALIDATION_ERROR for a malformed id", async () => {
      const { token } = await setup(0);
      const res = await get("/not-an-id", token);
      expect(res.statusCode).toBe(400);
      expect(res.json().errorType).toBe("VALIDATION_ERROR");
    });

    it("403 for a non-admin user", async () => {
      const { user, accessToken } = await createTestUser({ email: "plain@test.com" });
      expect((await get(`/${user.id}`, accessToken)).statusCode).toBe(403);
    });
  });
});
