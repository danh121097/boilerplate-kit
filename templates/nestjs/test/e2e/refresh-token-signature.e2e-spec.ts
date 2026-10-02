/**
 * E2E — the refresh JWT signature is verified with JWT_REFRESH_SECRET before the
 * hash lookup. Each forged token below is stored in the DB (hash, live record) so
 * that only the signature check can refuse it; every refusal is the same generic
 * 401 as an unknown token, and a genuine token still rotates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import supertest from "supertest";

import { RefreshToken, RefreshTokenDocument } from "@/schemas/refresh-token.schema";
import { INestApplication } from "@nestjs/common";
import { getModelToken } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { createTestApp } from "../helpers/create-test-app";
import { buildHmacHeaders } from "../helpers/sign-request";

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  await app.close();
});

function signedPost(path: string, body: object) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

const hash = (raw: string): string => crypto.createHash("sha256").update(raw).digest("hex");

let userCount = 0;

async function registerUser() {
  const res = await signedPost("/auth/register", {
    email: `signature-${++userCount}@example.com`,
    password: "Signature1!",
    name: "Signature",
  });
  expect(res.status).toBe(201);
  return {
    userId: res.body.data.user._id as string,
    refreshToken: res.body.data.tokens.refreshToken as string,
  };
}

/** Persist a live DB record for `raw`, as if the server had issued it. */
async function storeAsIssued(raw: string, userId: string): Promise<void> {
  const model = app.get<Model<RefreshTokenDocument>>(getModelToken(RefreshToken.name));
  await model.create({
    token: hash(raw),
    userId,
    familyId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
}

const claims = (userId: string) => ({
  userId,
  email: "signature@example.com",
  role: "user",
  token_use: "refresh",
});

async function expectGeneric401(raw: string) {
  const res = await signedPost("/auth/refresh", { refreshToken: raw });
  expect(res.status).toBe(401);
  expect(res.body).toMatchObject({
    success: false,
    errorType: "AUTHENTICATION_ERROR",
    message: "Invalid refresh token!",
  });
}

describe("refresh token signature", () => {
  it("rotates a genuine token", async () => {
    const { refreshToken } = await registerUser();
    expect((await signedPost("/auth/refresh", { refreshToken })).status).toBe(200);
  });

  it("refuses a token signed with a different secret", async () => {
    const { userId } = await registerUser();
    const forged = jwt.sign(claims(userId), "another-secret-that-is-at-least-32-chars!!", {
      algorithm: "HS256",
      expiresIn: "1h",
      jwtid: crypto.randomUUID(),
    });
    await storeAsIssued(forged, userId);
    await expectGeneric401(forged);
  });

  it("refuses a token whose payload was tampered with", async () => {
    const { userId, refreshToken } = await registerUser();
    const [header, , signature] = refreshToken.split(".");
    const payload = Buffer.from(
      JSON.stringify({
        ...claims(userId),
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const tampered = `${header}.${payload}.${signature}`;
    await storeAsIssued(tampered, userId);
    await expectGeneric401(tampered);
  });

  it("refuses a token signed with the right secret but already expired", async () => {
    const { userId } = await registerUser();
    const expired = jwt.sign(claims(userId), process.env.JWT_REFRESH_SECRET!, {
      algorithm: "HS256",
      expiresIn: -10,
      jwtid: crypto.randomUUID(),
    });
    await storeAsIssued(expired, userId);
    await expectGeneric401(expired);
  });

  it("refuses a correctly signed token that is not a refresh token", async () => {
    const { userId } = await registerUser();
    const wrongUse = jwt.sign(
      { ...claims(userId), token_use: "access" },
      process.env.JWT_REFRESH_SECRET!,
      {
        algorithm: "HS256",
        expiresIn: "1h",
        jwtid: crypto.randomUUID(),
      },
    );
    await storeAsIssued(wrongUse, userId);
    await expectGeneric401(wrongUse);
  });
});
