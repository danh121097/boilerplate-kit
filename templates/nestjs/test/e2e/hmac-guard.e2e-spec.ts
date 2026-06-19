/**
 * E2E — HMAC guard + guard ordering assertions.
 *
 * Guard order inside SecurityGuard is deterministic:
 *   1. HMAC   (all routes, no exemptions)
 *   2. Origin/CSRF (disabled in test env)
 *   3. JWT    (skipped for @Public)
 *   4. Roles  (skipped when no @Roles)
 *
 * Tests assert the REASON for 401/403 via errorType/message so that a guard
 * reorder regresses visibly instead of silently producing the wrong status.
 *
 * /health is @Public but NOT HMAC-exempt — unsigned → 401, signed → 200.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import {
  addBearerToken,
  buildBadSignatureHeaders,
  buildExpiredHmacHeaders,
  buildHmacHeaders,
} from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  await app.close();
});

// ── helpers ────────────────────────────────────────────────────────────────

/** POST with HMAC signing. */
function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

/** GET with HMAC + Bearer. */
function signedGetAuthed(path: string, accessToken: string) {
  const h = addBearerToken(buildHmacHeaders("GET", path), accessToken);
  return req
    .get(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Authorization", h.Authorization);
}

/** GET with HMAC only (no Bearer). */
function signedGetNoAuth(path: string) {
  const h = buildHmacHeaders("GET", path);
  return req
    .get(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime);
}

/** Register + login, return accessToken. */
async function registerAndLogin(suffix: string): Promise<string> {
  const user = {
    email: `hmac-${suffix}@example.com`,
    password: "HmacTest1!",
    name: `Hmac ${suffix}`,
  };
  await signedPost("/auth/register", user);
  const res = await signedPost("/auth/login", {
    email: user.email,
    password: user.password,
  });
  return res.body.data.tokens.accessToken as string;
}

// ── /health — public but HMAC required ────────────────────────────────────

describe("GET /health — @Public but HMAC required", () => {
  it("unsigned request → 401 (HMAC step fires even on @Public routes)", async () => {
    const res = await req.get("/api/v1/health");
    expect(res.status).toBe(401);
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
  });

  it("signed request → 200 with health envelope", async () => {
    const res = await signedGetNoAuth("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("database");
    expect(res.body).toHaveProperty("redis");
  });
});

// ── HMAC failure cases ─────────────────────────────────────────────────────

describe("HMAC failures — all return 401 AUTHENTICATION_ERROR", () => {
  it("missing sig and ctime headers → 401", async () => {
    const res = await req
      .get("/api/v1/health")
      .set("Content-Type", "application/json");
    expect(res.status).toBe(401);
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
  });

  it("sig present but ctime missing → 401", async () => {
    const h = buildHmacHeaders("GET", "/health");
    const res = await req.get("/api/v1/health").set("sig", h.sig);
    expect(res.status).toBe(401);
  });

  it("ctime present but sig missing → 401", async () => {
    const h = buildHmacHeaders("GET", "/health");
    const res = await req.get("/api/v1/health").set("ctime", h.ctime);
    expect(res.status).toBe(401);
  });

  it("bad signature → 401", async () => {
    const h = buildBadSignatureHeaders("GET", "/health");
    const res = await req
      .get("/api/v1/health")
      .set("sig", h.sig)
      .set("ctime", h.ctime);
    expect(res.status).toBe(401);
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
    expect(res.body.message).toMatch(/HMAC verification failed/i);
  });

  it("expired ctime → 401 (timestamp expired)", async () => {
    const h = buildExpiredHmacHeaders("GET", "/health");
    const res = await req
      .get("/api/v1/health")
      .set("sig", h.sig)
      .set("ctime", h.ctime);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/timestamp expired/i);
  });
});

// ── Guard ordering assertions ──────────────────────────────────────────────

describe("Guard ordering — HMAC → JWT → Roles", () => {
  it("unsigned + valid Bearer → 401 with HMAC reason (HMAC runs FIRST)", async () => {
    // Get a real access token so Bearer is valid.
    const token = await registerAndLogin("ordering-1");

    // Send with valid Bearer but NO HMAC headers.
    const res = await req
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    // Must be HMAC failure — not JWT failure. Proves HMAC runs first.
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
    expect(res.body.message).toMatch(/HMAC signature and timestamp headers are required/i);
  });

  it("HMAC signed + NO Bearer on protected route → 401 JWT reason (JWT runs after HMAC)", async () => {
    // /auth/me is NOT @Public — requires JWT.
    const res = await signedGetNoAuth("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.errorType).toBe("AUTHENTICATION_ERROR");
    // Must be JWT/access-token failure, not HMAC.
    expect(res.body.message).toMatch(/access token required/i);
  });

  it("HMAC signed + valid Bearer + user role on admin route → 403 (Roles runs last)", async () => {
    // Regular user (role=user) — not admin.
    const token = await registerAndLogin("ordering-2");

    const h = addBearerToken(buildHmacHeaders("GET", "/users"), token);
    const res = await req
      .get("/api/v1/users")
      .set("sig", h.sig)
      .set("ctime", h.ctime)
      .set("Authorization", h.Authorization);

    expect(res.status).toBe(403);
    expect(res.body.errorType).toBe("AUTHORIZATION_ERROR");
    // Must be role failure, not HMAC or JWT.
    expect(res.body.message).toMatch(/insufficient permissions/i);
  });

  it("@Public route with valid HMAC but no Bearer → 200 (JWT skipped for @Public)", async () => {
    // /health is @Public — HMAC is required but JWT is not.
    const res = await signedGetNoAuth("/health");
    expect(res.status).toBe(200);
  });
});

// ── HMAC path derivation parity ────────────────────────────────────────────

describe("HMAC path parity — prefix stripping", () => {
  it("POST signed with unprefixed path is accepted (prefix stripped by guard)", async () => {
    // Sign using the full prefixed URL — helper strips it.
    const body = {
      email: "parity@example.com",
      password: "Parity1!@",
      name: "Parity",
    };
    const h = buildHmacHeaders("POST", "/api/v1/auth/register", body);
    const res = await req
      .post("/api/v1/auth/register")
      .set("sig", h.sig)
      .set("ctime", h.ctime)
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(201);
  });

  it("GET signed with unprefixed path and query string — guard strips query", async () => {
    // /users?page=1 — guard strips query before comparing signed path.
    const token = await registerAndLogin("parity-get");
    const h = addBearerToken(buildHmacHeaders("GET", "/users?page=1"), token);
    // /users requires admin, but HMAC path derivation is tested by not getting 401.
    const res = await req
      .get("/api/v1/users?page=1")
      .set("sig", h.sig)
      .set("ctime", h.ctime)
      .set("Authorization", h.Authorization);
    // 403 (role) proves HMAC passed — a 401 would indicate HMAC path mismatch.
    expect(res.status).toBe(403);
    expect(res.body.errorType).toBe("AUTHORIZATION_ERROR");
  });
});
