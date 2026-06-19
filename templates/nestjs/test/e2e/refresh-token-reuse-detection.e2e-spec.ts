/**
 * E2E — Refresh token reuse detection.
 *
 * Scenario:
 *   1. Login → get refresh token R1.
 *   2. Refresh with R1 → rotated to R2 (R1 now revoked in DB).
 *   3. Replay R1 (already revoked) → 401 AND all user tokens revoked in DB.
 *   4. R2 (the rotated token) must also fail now — all sessions nuked.
 *
 * Redis is disabled (REDIS_ENABLED=false) in the test env. The reuse detection
 * and all-tokens-revoked logic is DB-driven (isRevoked flag + updateMany) so it
 * works fully without Redis. Access-token cutoff after logout requires Redis
 * (documented limitation) — that assertion is omitted here.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { buildHmacHeaders } from "../helpers/sign-request";
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

function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

const USER = {
  email: "reuse@example.com",
  password: "ReuseTest1!",
  name: "Reuse User",
};

// ── reuse detection ────────────────────────────────────────────────────────

describe("Refresh token reuse detection", () => {
  let refreshTokenR1: string;
  let refreshTokenR2: string;

  beforeAll(async () => {
    // Register + login to get initial token pair.
    await signedPost("/auth/register", USER);
    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    expect(loginRes.status).toBe(200);
    refreshTokenR1 = loginRes.body.data.tokens.refreshToken as string;

    // Rotate once: R1 → R2. R1 is now revoked.
    const rotateRes = await signedPost("/auth/refresh", {
      refreshToken: refreshTokenR1,
    });
    expect(rotateRes.status).toBe(200);
    refreshTokenR2 = rotateRes.body.data.tokens.refreshToken as string;
  });

  it("replaying revoked R1 returns 401", async () => {
    const res = await signedPost("/auth/refresh", {
      refreshToken: refreshTokenR1,
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/reuse detected/i);
  });

  it("after reuse replay, the rotated R2 is also revoked (all sessions nuked)", async () => {
    // Trigger reuse detection with R1.
    await signedPost("/auth/refresh", { refreshToken: refreshTokenR1 });

    // R2 (valid rotation of R1) must now also be rejected — updateMany revoked it.
    const res = await signedPost("/auth/refresh", { refreshToken: refreshTokenR2 });
    expect(res.status).toBe(401);
  });

  it("after reuse detection, a fresh login works (user can re-authenticate)", async () => {
    // Trigger reuse.
    await signedPost("/auth/refresh", { refreshToken: refreshTokenR1 });

    // User logs in again fresh.
    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.tokens.refreshToken).toBeTypeOf("string");

    // New refresh token works.
    const newToken = loginRes.body.data.tokens.refreshToken as string;
    const refreshRes = await signedPost("/auth/refresh", { refreshToken: newToken });
    expect(refreshRes.status).toBe(200);
  });
});
