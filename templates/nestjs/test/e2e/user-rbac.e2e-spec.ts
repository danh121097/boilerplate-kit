/**
 * E2E — User RBAC: admin-gated /users endpoints.
 *
 * Scenarios:
 *   - GET /users as role=user   → 403
 *   - GET /users as role=admin  → 200 with {status, data[], meta} envelope
 *   - GET /users/:id missing    → 404
 *   - password never in response
 *   - pagination meta shape
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Test } from "@nestjs/testing";
import { addBearerToken, buildHmacHeaders } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";

// We need direct DB access to seed an admin — inject via the app's mongoose connection.
import { AppModule } from "@/app.module";
import { User, UserDocument } from "@/schemas/user.schema";

let app: INestApplication;
let req: ReturnType<typeof supertest>;
let userModel: Model<UserDocument>;

let adminToken: string;
let userToken: string;
let seededUserId: string;

// ── helpers ────────────────────────────────────────────────────────────────

function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

function signedGetAuthed(path: string, token: string) {
  const h = addBearerToken(buildHmacHeaders("GET", path), token);
  return req
    .get(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Authorization", h.Authorization);
}

// ── bootstrap ──────────────────────────────────────────────────────────────

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());

  // Access mongoose User model via NestJS DI.
  userModel = app.get<Model<UserDocument>>("UserModel");

  // Seed a regular user.
  const regularUser = {
    email: "regular@example.com",
    password: "Regular1!",
    name: "Regular User",
  };
  await signedPost("/auth/register", regularUser);
  const userLogin = await signedPost("/auth/login", {
    email: regularUser.email,
    password: regularUser.password,
  });
  userToken = userLogin.body.data.tokens.accessToken as string;
  seededUserId = userLogin.body.data.user._id as string;

  // Seed an admin by directly setting role in DB (register creates role=user).
  const adminEmail = "admin@example.com";
  await signedPost("/auth/register", {
    email: adminEmail,
    password: "Admin1!@#",
    name: "Admin User",
  });
  await userModel.updateOne({ email: adminEmail }, { role: "admin" });
  const adminLogin = await signedPost("/auth/login", {
    email: adminEmail,
    password: "Admin1!@#",
  });
  adminToken = adminLogin.body.data.tokens.accessToken as string;
}, 30_000);

afterAll(async () => {
  await app.close();
});

// ── tests ──────────────────────────────────────────────────────────────────

describe("GET /users — role=user (403)", () => {
  it("returns 403 AUTHORIZATION_ERROR for regular user", async () => {
    const res = await signedGetAuthed("/users", userToken);
    expect(res.status).toBe(403);
    expect(res.body.errorType).toBe("AUTHORIZATION_ERROR");
  });
});

describe("GET /users — role=admin (200)", () => {
  it("returns 200 with {status, data, meta} envelope", async () => {
    const res = await signedGetAuthed("/users", adminToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty("meta");
  });

  it("meta has expected shape (page, limit, total, totalPages, hasNext, hasPrev)", async () => {
    const res = await signedGetAuthed("/users", adminToken);
    const { meta } = res.body as {
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    };
    expect(meta).toHaveProperty("page");
    expect(meta).toHaveProperty("limit");
    expect(meta).toHaveProperty("total");
    expect(meta).toHaveProperty("totalPages");
    expect(meta).toHaveProperty("hasNext");
    expect(meta).toHaveProperty("hasPrev");
  });

  it("password is not present in any user object in the list", async () => {
    const res = await signedGetAuthed("/users", adminToken);
    const users = res.body.data as Record<string, unknown>[];
    for (const u of users) {
      expect(u).not.toHaveProperty("password");
    }
  });

  it("returns paginated subset with ?page=1&limit=1", async () => {
    const path = "/users?page=1&limit=1";
    const h = addBearerToken(buildHmacHeaders("GET", path), adminToken);
    const res = await req
      .get(`/api/v1${path}`)
      .set("sig", h.sig)
      .set("ctime", h.ctime)
      .set("Authorization", h.Authorization);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.limit).toBe(1);
  });
});

describe("GET /users/:id — admin access", () => {
  it("returns 200 with single user for valid id", async () => {
    const res = await signedGetAuthed(`/users/${seededUserId}`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data).not.toHaveProperty("password");
  });

  it("returns 404 for non-existent ObjectId", async () => {
    const fakeId = "507f1f77bcf86cd799439099";
    const res = await signedGetAuthed(`/users/${fakeId}`, adminToken);
    expect(res.status).toBe(404);
    expect(res.body.errorType).toBe("NOT_FOUND");
  });

  it("returns 403 for regular user trying to access by id", async () => {
    const res = await signedGetAuthed(`/users/${seededUserId}`, userToken);
    expect(res.status).toBe(403);
  });
});
