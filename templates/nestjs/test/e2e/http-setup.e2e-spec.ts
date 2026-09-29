/**
 * E2E — HTTP setup shared with main.ts (configureApp) and request-edge behavior:
 *   - CORS preflight allows the HMAC headers `sig` / `ctime`
 *   - body-parser failures (too large, malformed JSON) answer 413 / 400 in the
 *     standard error envelope, not 500, and are not logged at error level
 *   - Zod validation failures carry the issue messages joined with ", "
 *   - bodyless refresh/logout behave like `{}`; an empty body token falls back to the cookie
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { AppLogger } from "@/common/logger/app-logger.service";
import { INestApplication } from "@nestjs/common";
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

function signedPost(path: string, body?: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  const request = req.post(`/api/v1${path}`).set("sig", h.sig).set("ctime", h.ctime);
  return body === undefined
    ? request
    : request.set("Content-Type", "application/json").send(body as object);
}

const ENVELOPE = { success: false, status: "error" };

describe("CORS preflight", () => {
  it("allows the sig and ctime request headers for an allowed origin", async () => {
    const res = await req
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "sig,ctime,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowed = String(res.headers["access-control-allow-headers"]).toLowerCase();
    expect(allowed).toContain("sig");
    expect(allowed).toContain("ctime");
  });
});

describe("body-parser errors", () => {
  it("answers 413 in the standard envelope for an oversized body, without an error log", async () => {
    const errorLog = vi.spyOn(AppLogger.prototype, "error");
    try {
      const res = await req
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ email: "a@example.com", password: "x".repeat(200_000) }));

      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "VALIDATION_ERROR",
        error_code: 413,
      });
      expect(res.body.error_message).toBe(res.body.message);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("answers 400 in the standard envelope for malformed JSON, without an error log", async () => {
    const errorLog = vi.spyOn(AppLogger.prototype, "error");
    try {
      const res = await req
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json")
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "VALIDATION_ERROR",
        error_code: 400,
      });
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe("validation messages", () => {
  it("returns the Zod issue message, like the express validator", async () => {
    const res = await signedPost("/auth/login", { email: "not-an-email", password: "x" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ...ENVELOPE,
      errorType: "VALIDATION_ERROR",
      message: "Invalid email format",
      error_message: "Invalid email format",
      error_code: 400,
    });
  });

  it("joins several issue messages with a comma", async () => {
    const res = await signedPost("/auth/register", { email: "bad", password: "short", name: " " });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Invalid email format, Password must be at least 8 characters, Name is required",
    );
  });
});

describe("refresh / logout body handling", () => {
  it("bodyless refresh uses the refresh cookie", async () => {
    const reg = await signedPost("/auth/register", {
      email: "bodyless@example.com",
      password: "Bodyless1!",
      name: "Bodyless",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/refresh").set("Cookie", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.refreshToken).toBeTypeOf("string");
  });

  it("bodyless refresh without a cookie is a 401 in the standard envelope", async () => {
    const res = await signedPost("/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ...ENVELOPE, errorType: "AUTHENTICATION_ERROR" });
  });

  it("bodyless logout returns 200 and revokes the cookie token", async () => {
    const reg = await signedPost("/auth/register", {
      email: "bodyless-out@example.com",
      password: "Bodyless1!",
      name: "Bodyless Out",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/logout").set("Cookie", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);

    const replay = await signedPost("/auth/refresh", { refreshToken });
    expect(replay.status).toBe(401);
  });

  it("an empty body refreshToken falls back to the cookie", async () => {
    const reg = await signedPost("/auth/register", {
      email: "empty-body@example.com",
      password: "EmptyBody1!",
      name: "Empty Body",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/refresh", { refreshToken: "" }).set(
      "Cookie",
      `refreshToken=${refreshToken}`,
    );
    expect(res.status).toBe(200);
  });
});
