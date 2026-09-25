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
 *   3. A storage error fails open (request allowed), matching express
 *      `passOnStoreError: true`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { AppThrottlerGuard } from "@/common/throttler/throttler.module";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, getStorageToken } from "@nestjs/throttler";
import { buildHmacHeaders } from "../helpers/sign-request";
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

function signedPost(path: string, body: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  return req
    .post(`/api/v1${path}`)
    .set("sig", h.sig)
    .set("ctime", h.ctime)
    .set("Content-Type", "application/json")
    .send(body);
}

function signedGet(path: string) {
  const h = buildHmacHeaders("GET", path);
  return req.get(`/api/v1${path}`).set("sig", h.sig).set("ctime", h.ctime);
}

describe("Throttler (enabled)", () => {
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
      error_code: 429,
    });
  });

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
});
