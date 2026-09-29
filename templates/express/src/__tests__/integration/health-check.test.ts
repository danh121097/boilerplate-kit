import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { closeServer, listenOnLoopback } from "@/__tests__/helpers/loopback-server";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { Server } from "http";
import app from "@/app";
import request from "supertest";

describe("GET /api/v1/health", () => {
  let server: Server;
  beforeAll(async () => {
    server = await listenOnLoopback(app);
  });
  afterAll(async () => {
    await closeServer(server);
  });

  it("returns 200 with status ok", async () => {
    const url = "/api/v1/health";
    const res = await request(server).get(url).set(signHmac("GET", url));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBeDefined();
    expect(res.body.uptime).toBeGreaterThan(0);
    // Redis is disabled under test env (REDIS_ENABLED unset).
    expect(res.body.redis).toBe("disabled");
  });
});
