/**
 * E2E — concurrent refresh with ONE refresh token.
 *
 * Rotation claims the old token atomically (findOneAndUpdate on
 * {token, isRevoked:false, expiresAt > now}): exactly one caller rotates it. The
 * losers see a token rotated moments ago and are served as a benign retry (200)
 * without revoking anything — see refresh-token-reuse-grace.e2e-spec.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import { INestApplication } from "@nestjs/common";
import { buildHmacHeaders } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";
import { countActiveInFamily } from "../helpers/refresh-token-db";

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
  it("parallel refreshes with one token claim it once and never revoke the family", async () => {
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
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    // Exactly one response consumed the claimed token; the rest are graced retries
    // that each minted their own successor, so 5 active tokens remain.
    expect(await countActiveInFamily(app, refreshToken)).toBe(5);
  });
});
