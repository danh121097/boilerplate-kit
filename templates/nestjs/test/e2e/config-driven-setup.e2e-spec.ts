/**
 * E2E — settings that come from env at boot: token lifetimes and TRUST_PROXY.
 *
 * Env is set in vi.hoisted so it is in place before AppModule is imported
 * (ConfigModule validates process.env when its module file is first loaded).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

vi.hoisted(() => {
  process.env.JWT_ACCESS_EXPIRY = "30m";
  process.env.JWT_REFRESH_EXPIRY = "2h";
  process.env.TRUST_PROXY = "1";
});

import { INestApplication } from "@nestjs/common";
import { createTestApp } from "../helpers/create-test-app";
import { findStoredToken } from "../helpers/refresh-token-db";
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

describe("token lifetimes from JWT_*_EXPIRY", () => {
  it("drive the cookie maxAge and the stored refresh expiresAt", async () => {
    const body = { email: "lifetimes@example.com", password: "Lifetimes1!", name: "Lifetimes" };
    const h = buildHmacHeaders("POST", "/auth/register", body);
    const res = await req
      .post("/api/v1/auth/register")
      .set("sig", h.sig)
      .set("ctime", h.ctime)
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(201);

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((c) => c.startsWith("accessToken="))).toMatch(/Max-Age=1800/);
    expect(cookies.find((c) => c.startsWith("refreshToken="))).toMatch(/Max-Age=7200/);

    const stored = await findStoredToken(app, res.body.data.tokens.refreshToken as string);
    const remainingMs = stored!.expiresAt.getTime() - Date.now();
    expect(Math.abs(remainingMs - 2 * 60 * 60 * 1000)).toBeLessThan(60_000);
  });
});

describe("TRUST_PROXY", () => {
  it("is applied to the express app", () => {
    const express = app.getHttpAdapter().getInstance() as { get(name: string): unknown };
    expect(express.get("trust proxy")).toBe(1);
  });
});
