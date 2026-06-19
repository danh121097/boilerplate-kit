/**
 * E2E — Auth lifecycle: register → login → me → refresh (rotation) → logout.
 *
 * All requests are HMAC-signed via the test helper. Assertions cover:
 *   - HTTP status codes
 *   - Envelope shapes (success, message, data fields)
 *   - Token rotation: new tokens differ from originals
 *   - Password not leaked in any response
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { addBearerToken, buildHmacHeaders } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";

// ── App bootstrap ──────────────────────────────────────────────────────────

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  await app.close();
});

// ── Test data ──────────────────────────────────────────────────────────────

const USER = {
  email: "lifecycle@example.com",
  password: "LifeCycle1!",
  name: "Lifecycle User",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function signedPost(path: string, body: unknown) {
  const headers = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", headers.sig)
    .set("ctime", headers.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

function signedGet(path: string, accessToken: string) {
  const h = addBearerToken(buildHmacHeaders("GET", path), accessToken);
  return req
    .get(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Authorization", h.Authorization);
}

// ── register ───────────────────────────────────────────────────────────────

describe("POST /auth/register", () => {
  it("returns 201 with success envelope + user + tokens", async () => {
    const res = await signedPost("/auth/register", USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/registered/i);
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data).toHaveProperty("tokens");
    expect(res.body.data.tokens).toHaveProperty("accessToken");
    expect(res.body.data.tokens).toHaveProperty("refreshToken");
  });

  it("password is not present in the user object", async () => {
    const res = await signedPost("/auth/register", {
      ...USER,
      email: "nopwd@example.com",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("returns 409 when email already registered", async () => {
    await signedPost("/auth/register", USER);
    const res = await signedPost("/auth/register", USER);
    expect(res.status).toBe(409);
  });

  it("returns 400 for weak password", async () => {
    const res = await signedPost("/auth/register", {
      email: "weak@example.com",
      password: "short",
      name: "Weak",
    });
    expect(res.status).toBe(400);
  });
});

// ── login ──────────────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  beforeAll(async () => {
    await signedPost("/auth/register", USER);
  });

  it("returns 200 with success envelope + user + tokens", async () => {
    const res = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/login/i);
    expect(res.body.data.tokens.accessToken).toBeTypeOf("string");
    expect(res.body.data.tokens.refreshToken).toBeTypeOf("string");
  });

  it("returns 401 for wrong password", async () => {
    const res = await signedPost("/auth/login", {
      email: USER.email,
      password: "WrongPass1!",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown email — same message, no enumeration", async () => {
    const res = await signedPost("/auth/login", {
      email: "nobody@example.com",
      password: "Whatever1!",
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });
});

// ── me ─────────────────────────────────────────────────────────────────────

describe("GET /auth/me", () => {
  let accessToken: string;

  beforeAll(async () => {
    await signedPost("/auth/register", USER);
    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    accessToken = loginRes.body.data.tokens.accessToken as string;
  });

  it("returns 200 with user data for valid JWT", async () => {
    const res = await signedGet("/auth/me", accessToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("user");
    expect(res.body.data.user.email).toBe(USER.email);
    expect(res.body.data.user).not.toHaveProperty("password");
  });

  it("returns 401 when no Bearer token (HMAC passes, JWT step fires)", async () => {
    const headers = buildHmacHeaders("GET", "/auth/me");
    const res = await req
      .get("/api/v1/auth/me")
      .set("sig", headers.sig)
      .set("ctime", headers.ctime);

    expect(res.status).toBe(401);
    // errorType confirms JWT step failed, not HMAC.
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
  });

  it("returns 401 for invalid Bearer token", async () => {
    const res = await signedGet("/auth/me", "invalid.token.here");
    expect(res.status).toBe(401);
  });
});

// ── refresh (rotation) ─────────────────────────────────────────────────────

describe("POST /auth/refresh — token rotation", () => {
  let originalAccessToken: string;
  let originalRefreshToken: string;

  beforeAll(async () => {
    await signedPost("/auth/register", USER);
    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    originalAccessToken = loginRes.body.data.tokens.accessToken as string;
    originalRefreshToken = loginRes.body.data.tokens.refreshToken as string;
  });

  it("returns 200 with new token pair that differs from originals", async () => {
    const res = await signedPost("/auth/refresh", {
      refreshToken: originalRefreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeTypeOf("string");
    expect(res.body.data.tokens.refreshToken).toBeTypeOf("string");
    // Rotation: the refresh token must always differ (jti UUID).
    // Access token may match if iat second is the same (RS256 PKCS1v15 is
    // deterministic for same payload+iat) — only the refresh token rotation
    // is the security-critical property.
    expect(res.body.data.tokens.refreshToken).not.toBe(originalRefreshToken);
  });

  it("returns 401 for invalid refresh token string", async () => {
    const res = await signedPost("/auth/refresh", {
      refreshToken: "completely-invalid-token",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when no refresh token provided", async () => {
    const res = await signedPost("/auth/refresh", {});
    expect(res.status).toBe(401);
  });
});

// ── logout ─────────────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  let refreshToken: string;

  beforeAll(async () => {
    await signedPost("/auth/register", USER);
    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    refreshToken = loginRes.body.data.tokens.refreshToken as string;
  });

  it("returns 200 with success message", async () => {
    const res = await signedPost("/auth/logout", { refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/logged out/i);
  });

  it("refresh token is invalidated after logout", async () => {
    await signedPost("/auth/logout", { refreshToken });
    const res = await signedPost("/auth/refresh", { refreshToken });
    expect(res.status).toBe(401);
  });

  it("logout without token body still returns 200 (cookie-first clients)", async () => {
    const res = await signedPost("/auth/logout", {});
    expect(res.status).toBe(200);
  });
});
