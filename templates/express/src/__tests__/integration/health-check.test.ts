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

  it("serves Swagger UI and the generated OpenAPI document without HMAC headers", async () => {
    const [ui, document] = await Promise.all([
      request(server).get("/docs/"),
      request(server).get("/docs/json"),
    ]);

    expect(ui.status).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
    expect(ui.text).toContain("swagger-ui-init.js");
    expect(ui.text).not.toContain("hmac-config.js");

    expect(document.status).toBe(200);
    expect(document.body.openapi).toBe("3.1.0");
    expect(
      document.body.paths["/api/v1/auth/register"].post.requestBody.content["application/json"]
        .schema.properties,
    ).toHaveProperty("email");
    expect(document.body.paths["/api/v1/auth/me"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(document.body.components.securitySchemes).toEqual({
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });

    const hmacConfig = await request(server).get("/docs/hmac-config.js");
    expect(hmacConfig.headers["content-type"]).toContain("text/html");
    expect(hmacConfig.text).not.toContain("test-hmac-secret-key");
    expect((await request(server).get("/api/v1/health")).status).toBe(401);
  });
});
