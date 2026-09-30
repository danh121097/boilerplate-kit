/**
 * E2E — Refresh token reuse detection.
 *
 * Scenario:
 *   1. Login → get refresh token R1.
 *   2. Refresh with R1 → rotated to R2 (R1 now revoked in DB).
 *   3. Replay R1 after the reuse grace window → 401 AND all user tokens revoked.
 *   4. R2 (the rotated token) must also fail now — all sessions nuked.
 *
 * Replays inside the grace window are benign retries and covered by
 * refresh-token-reuse-grace.e2e-spec.ts; here the rotation is backdated instead of
 * waiting. Redis is disabled (REDIS_ENABLED=false) in the test env. Reuse detection
 * is DB-driven (isRevoked flag + updateMany) so it works fully without Redis.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { buildHmacHeaders } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";
import { backdateRotation } from "../helpers/refresh-token-db";
import { REFRESH_REUSE_GRACE_MS } from "@/modules/auth/refresh-session.service";

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

function signedPost(path: string, body: object) {
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

/** Register, log in, rotate R1 → R2, and age R1's rotation past the grace window. */
async function rotateAndAge(): Promise<{ r1: string; r2: string }> {
  await signedPost("/auth/register", USER);
  const loginRes = await signedPost("/auth/login", {
    email: USER.email,
    password: USER.password,
  });
  expect(loginRes.status).toBe(200);
  const r1 = loginRes.body.data.tokens.refreshToken as string;

  const rotateRes = await signedPost("/auth/refresh", { refreshToken: r1 });
  expect(rotateRes.status).toBe(200);
  const r2 = rotateRes.body.data.tokens.refreshToken as string;

  await backdateRotation(app, r1, REFRESH_REUSE_GRACE_MS + 1_000);
  return { r1, r2 };
}

describe("Refresh token reuse detection", () => {
  it("replaying revoked R1 after the grace window returns 401", async () => {
    const { r1 } = await rotateAndAge();
    const res = await signedPost("/auth/refresh", { refreshToken: r1 });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/reuse detected/i);
  });

  it("after reuse replay, the rotated R2 is also revoked (all sessions nuked)", async () => {
    const { r1, r2 } = await rotateAndAge();
    await signedPost("/auth/refresh", { refreshToken: r1 });

    const res = await signedPost("/auth/refresh", { refreshToken: r2 });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/reuse detected/i);
  });

  it("after reuse detection, a fresh login works (user can re-authenticate)", async () => {
    const { r1 } = await rotateAndAge();
    await signedPost("/auth/refresh", { refreshToken: r1 });

    const loginRes = await signedPost("/auth/login", {
      email: USER.email,
      password: USER.password,
    });
    expect(loginRes.status).toBe(200);

    const newToken = loginRes.body.data.tokens.refreshToken as string;
    const refreshRes = await signedPost("/auth/refresh", { refreshToken: newToken });
    expect(refreshRes.status).toBe(200);
  });
});
