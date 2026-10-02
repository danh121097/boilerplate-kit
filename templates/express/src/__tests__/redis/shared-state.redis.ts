import {
  bootInstance,
  clearAppKeys,
  REDIS_URL,
  startRedisProxy,
  waitForDown,
  waitForReady,
  type AppInstance,
  type TcpProxy,
} from "@/__tests__/redis/redis-lane";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Behaviour only a real Redis proves: state shared by two app copies, and recovery after
 * the connection is cut. Run with `pnpm test:redis` (needs REDIS_URL).
 */

const LOGIN_LIMIT = 30;
const badLogin = (app: AppInstance) =>
  // Invalid body on purpose: it passes the limiter, then 400s before any bcrypt compare.
  app.call("post", "/auth/login", { body: { email: "nobody@example.com" } });

beforeEach(async () => {
  await clearAppKeys(REDIS_URL);
});

describe("two instances on one Redis", () => {
  let a: AppInstance;
  let b: AppInstance;
  beforeAll(async () => {
    a = await bootInstance(REDIS_URL);
    b = await bootInstance(REDIS_URL);
  });
  afterAll(async () => {
    await a.stop();
    await b.stop();
  });

  it("shares rate-limit counters: the limit hit on A is enforced on B", async () => {
    for (let i = 0; i < LOGIN_LIMIT; i++) {
      expect((await badLogin(a)).status, `A call ${i + 1}`).toBe(400);
    }
    const res = await badLogin(b);
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ errorType: "RATE_LIMIT" });
  });

  it("shows the access-token revocation cutoff set by a logout on A to B", async () => {
    const creds = { email: "shared@example.com", password: "Password1!", name: "Shared" };
    const registered = await a.call("post", "/auth/register", { body: creds });
    expect(registered.status).toBe(201);
    const { accessToken, refreshToken } = registered.body.data.tokens;

    expect((await b.call("get", "/auth/me", { token: accessToken })).status).toBe(200);

    // The cutoff is compared in milliseconds with the token's issue time.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await a.call("post", "/auth/logout", { body: { refreshToken } })).status).toBe(200);

    const after = await b.call("get", "/auth/me", { token: accessToken });
    expect(after.status).toBe(401);
    expect(after.body.message).toBe("Token revoked! Please log in again!");
  });
});

describe("Redis outage mid-run", () => {
  let proxy: TcpProxy;
  let app: AppInstance;
  beforeAll(async () => {
    proxy = await startRedisProxy(REDIS_URL);
    app = await bootInstance(proxy.url);
  });
  afterAll(async () => {
    await app.stop();
    await proxy.stop().catch(() => undefined);
  });

  it("fails open during the outage and resumes counting after recovery", async () => {
    for (let i = 0; i < 3; i++) expect((await badLogin(app)).status).toBe(400);

    await proxy.stop();
    await waitForDown(() => app.redisStatus());

    // More calls than the limit: none is blocked and none errors while Redis is down.
    for (let i = 0; i < LOGIN_LIMIT + 5; i++) {
      expect((await badLogin(app)).status, `outage call ${i + 1}`).toBe(400);
    }

    await proxy.start();
    await waitForReady(() => app.redisStatus());

    // The 3 calls counted before the outage survived; 27 more reach the limit, then 429.
    for (let i = 0; i < LOGIN_LIMIT - 3; i++) {
      expect((await badLogin(app)).status, `recovered call ${i + 1}`).toBe(400);
    }
    expect((await badLogin(app)).status).toBe(429);
  });
});
