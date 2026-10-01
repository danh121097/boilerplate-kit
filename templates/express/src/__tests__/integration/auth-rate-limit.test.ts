import { enableRateLimits } from "@/__tests__/helpers/enable-rate-limits";
import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { closeServer, listenOnLoopback } from "@/__tests__/helpers/loopback-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "http";
import app from "@/app";
import request from "supertest";

const LIMIT = 30;
const LIMITED_MESSAGE = "Too many requests, please try again later!";

describe("auth rate limits", () => {
  enableRateLimits();

  let server: Server;
  beforeAll(async () => {
    server = await listenOnLoopback(app);
  });
  afterAll(async () => {
    await closeServer(server);
  });

  const post = (path: string, body: Record<string, unknown> = {}) => {
    const url = `/api/v1/auth/${path}`;
    return request(server)
      .post(url)
      .set(signHmac("POST", url, body))
      .send(body);
  };

  it("shares one bucket across register, refresh and logout; login has its own", async () => {
    const calls = ["register", "refresh", "logout"];
    for (let i = 0; i < LIMIT; i++) {
      // Bodies are invalid or unauthenticated on purpose: any non-429 reply proves the call
      // passed the limiter, and it still counts against the shared bucket.
      const res = await post(calls[i % calls.length], { refreshToken: "not-a-token" });
      expect(res.status, `call ${i + 1} (${calls[i % calls.length]})`).not.toBe(429);
    }

    const blocked = await post("refresh", { refreshToken: "not-a-token" });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      success: false,
      errorType: "RATE_LIMIT",
      message: LIMITED_MESSAGE,
    });
    // Every shared-bucket route is now limited...
    expect((await post("register", { email: "x" })).status).toBe(429);
    expect((await post("logout")).status).toBe(429);

    // ...but login still has its own full allowance.
    for (let i = 0; i < LIMIT; i++) {
      const res = await post("login", { email: "nobody@example.com", password: "Password1!" });
      expect(res.status, `login ${i + 1}`).toBe(401);
    }
    const loginBlocked = await post("login", {
      email: "nobody@example.com",
      password: "Password1!",
    });
    expect(loginBlocked.status).toBe(429);
    expect(loginBlocked.body).toMatchObject({
      errorType: "RATE_LIMIT",
      message: "Too many login attempts, please try again later!",
    });
  });
});
