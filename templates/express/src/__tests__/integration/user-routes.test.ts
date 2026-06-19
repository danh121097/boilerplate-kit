import { createTestUser } from "@/__tests__/helpers/create-test-user";
import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { User } from "@/models/user";
import { describe, it, expect } from "vitest";
import app from "@/app";
import request from "supertest";

describe("User Routes — GET /users (offset pagination)", () => {
  const url = "/api/v1/users";

  /** Admin token (list is admin-and-above) + N extra regular users seeded. */
  const setup = async (extraUsers: number) => {
    const { accessToken } = await createTestUser({ email: "admin@test.com", role: "admin" });
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
    return accessToken;
  };

  const list = (token: string, query = "") =>
    request(app)
      .get(url + query)
      .set(signHmac("GET", url))
      .set("Authorization", `Bearer ${token}`);

  it("returns first page with meta and respects limit", async () => {
    const token = await setup(24); // 24 + admin = 25 total
    const res = await list(token, "?page=1&limit=20");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
      hasNext: true,
      hasPrev: false,
    });
  });

  it("returns the remainder on the last page", async () => {
    const token = await setup(24); // total 25
    const res = await list(token, "?page=2&limit=20");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta.hasNext).toBe(false);
    expect(res.body.meta.hasPrev).toBe(true);
  });

  it("defaults to page 1 / limit 20 when no query params", async () => {
    const token = await setup(0); // only admin
    const res = await list(token);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(20);
    expect(res.body.meta.total).toBe(1);
  });

  it("clamps an over-large limit to 100", async () => {
    const token = await setup(0);
    const res = await list(token, "?limit=9999");
    expect(res.body.meta.limit).toBe(100);
  });

  it("never leaks the password field", async () => {
    const token = await setup(2);
    const res = await list(token);
    for (const u of res.body.data) {
      expect(u.password).toBeUndefined();
    }
  });

  it("rejects a non-admin user with 403", async () => {
    const { accessToken } = await createTestUser({ email: "plain@test.com", role: "user" });
    const res = await list(accessToken);
    expect(res.status).toBe(403);
  });

  it("rejects a request without HMAC with 401", async () => {
    const { accessToken } = await createTestUser({ email: "admin2@test.com", role: "admin" });
    const res = await request(app).get(url).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });
});
