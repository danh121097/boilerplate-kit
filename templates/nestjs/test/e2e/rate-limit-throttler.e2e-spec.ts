/**
 * E2E — rate limiting with the throttler ENABLED.
 *
 * AppThrottlerGuard.shouldSkip returns true under NODE_ENV=test, so every other
 * spec runs unthrottled. Here it is stubbed to defer to ThrottlerGuard's own
 * shouldSkip (false), exercising the real guard + in-memory storage.
 *
 * Proves:
 *   1. Exceeding a limit returns 429 RATE_LIMIT (the guard's catch must not
 *      swallow the throttling exception).
 *   2. The named `auth`/`login` throttlers (30 / 15 min) only count on routes
 *      that opt in via @Throttle — a non-auth route is capped by `default` only.
 *   3. Counters are shared across routes: `auth` (register/refresh/logout) is one
 *      30 / 15 min bucket per client, `login` has its own, and `default` is one
 *      100 / min bucket per client across every route.
 *   4. A storage error fails open (request allowed), matching express
 *      `passOnStoreError: true`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { AppThrottlerGuard } from "@/common/throttler/throttler.module";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, getStorageToken } from "@nestjs/throttler";
import { addBearerToken, buildHmacHeaders } from "../helpers/sign-request";
import { createTestApp } from "../helpers/create-test-app";

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  vi.spyOn(AppThrottlerGuard.prototype as any, "shouldSkip").mockResolvedValue(false);
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await app.close();
});

function signedPost(path: string, body: object, clientIp?: string) {
  const h = buildHmacHeaders("POST", path, body);
  const request = req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json");
  if (clientIp) request.set("X-Forwarded-For", clientIp);
  return request.send(body);
}

function signedGet(path: string, clientIp?: string) {
  const h = buildHmacHeaders("GET", path);
  const request = req.get(`/api/v1${path}`).set("sig", h.sig).set("ctime", h.ctime);
  return clientIp ? request.set("X-Forwarded-For", clientIp) : request;
}

describe("Throttler (enabled)", () => {
  // 30 unknown-user logins each pay one bcrypt compare (timing equalization).
  it("blocks the 31st login in the window with a 429 RATE_LIMIT envelope", async () => {
    const body = { email: "nobody@example.com", password: "WrongPass1!" };
    for (let i = 0; i < 30; i++) {
      const res = await signedPost("/auth/login", body);
      expect(res.status).toBe(401);
    }

    const blocked = await signedPost("/auth/login", body);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      success: false,
      errorType: "RATE_LIMIT",
      message: "Too many login attempts, please try again later!",
      error_code: 429,
      error_message: "Too many login attempts, please try again later!",
    });
  }, 60_000);

  it("does not apply the auth/login caps to non-auth routes", async () => {
    // 40 > the 30-request auth/login cap, < the 100/min default cap.
    for (let i = 0; i < 40; i++) {
      const res = await signedGet("/health");
      expect(res.status).not.toBe(429);
    }
  });

  it("fails open when the throttler storage throws", async () => {
    const storage = app.get<ThrottlerStorage>(getStorageToken());
    const spy = vi.spyOn(storage, "increment").mockRejectedValue(new Error("storage down"));
    try {
      // /auth/login is already over its limit from the first test — with a
      // broken store the request must still reach the handler (401, not 429/500).
      const res = await signedPost("/auth/login", {
        email: "nobody@example.com",
        password: "WrongPass1!",
      });
      expect(res.status).toBe(401);
    } finally {
      spy.mockRestore();
    }
  });

  describe("shared counters across routes", () => {
    // Distinct X-Forwarded-For per test gives each its own client (and counters).
    beforeAll(() => {
      app.getHttpAdapter().getInstance().set("trust proxy", true);
    });

    // register (400), refresh (401) and logout (200) all answer without bcrypt.
    const authCall = (i: number, ip: string) => {
      if (i % 3 === 0) return signedPost("/auth/register", {}, ip);
      if (i % 3 === 1) return signedPost("/auth/refresh", { refreshToken: "x" }, ip);
      return signedPost("/auth/logout", { refreshToken: "x" }, ip);
    };

    it("counts register/refresh/logout against one auth bucket; login keeps its own", async () => {
      const ip = "203.0.113.10";
      for (let i = 0; i < 30; i++) {
        expect((await authCall(i, ip)).status).not.toBe(429);
      }

      for (let i = 0; i < 3; i++) {
        const blocked = await authCall(i, ip);
        expect(blocked.status).toBe(429);
        expect(blocked.body).toMatchObject({
          success: false,
          errorType: "RATE_LIMIT",
          message: "Too many requests, please try again later!",
        });
      }

      // The login bucket is untouched by the 30 auth calls.
      const login = await signedPost(
        "/auth/login",
        { email: "nobody@example.com", password: "WrongPass1!" },
        ip,
      );
      expect(login.status).toBe(401);

      // Another client has its own auth bucket.
      expect((await authCall(0, "203.0.113.11")).status).not.toBe(429);
    }, 60_000);

    it("counts the default cap once per client across different routes", async () => {
      const ip = "203.0.113.20";
      // Routes that fail in SecurityGuard never reach the throttler, so use a real
      // session: /auth/me with a Bearer token passes every guard.
      const reg = await signedPost(
        "/auth/register",
        { email: "default-cap@example.com", password: "DefaultCap1!", name: "Cap" },
        ip,
      );
      expect(reg.status).toBe(201); // counts 1 against the default bucket
      const token = reg.body.data.tokens.accessToken as string;
      const me = () => {
        const h = addBearerToken(buildHmacHeaders("GET", "/auth/me"), token);
        return req
          .get("/api/v1/auth/me")
          .set("sig", h.sig)
          .set("ctime", h.ctime)
          .set("Authorization", h.Authorization)
          .set("X-Forwarded-For", ip);
      };

      for (let i = 0; i < 99; i++) {
        const res = i % 2 === 0 ? await signedGet("/health", ip) : await me();
        expect(res.status).toBe(200);
      }

      expect((await signedGet("/health", ip)).status).toBe(429);
      const other = await me();
      expect(other.status).toBe(429);
      expect(other.body.errorType).toBe("RATE_LIMIT");
    }, 60_000);
  });
});
