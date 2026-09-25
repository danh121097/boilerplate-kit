/**
 * E2E — concurrent refresh with ONE refresh token.
 *
 * Rotation claims the old token atomically (findOneAndUpdate on
 * {token, isRevoked:false, expiresAt > now}), so N parallel refreshes with the
 * same token must produce exactly one 200; the losers see an already-revoked
 * token and are rejected as reuse (401).
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

function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

describe("Refresh token concurrency", () => {
  it("parallel refreshes with one token yield exactly one 200", async () => {
    const reg = await signedPost("/auth/register", {
      email: "race@example.com",
      password: "RaceTest1!",
      name: "Race User",
    });
    expect(reg.status).toBe(201);
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => signedPost("/auth/refresh", { refreshToken })),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 401)).toHaveLength(4);
  });
});
