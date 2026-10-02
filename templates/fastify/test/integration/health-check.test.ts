import { buildApp } from "@/app";
import { config } from "@/config/environment";
import { API, createSignedRequest } from "../helpers/signed-request";
import type { FastifyInstance } from "fastify";

describe("GET /api/v1/health", () => {
  let app: FastifyInstance;
  let signedRequest: ReturnType<typeof createSignedRequest>;

  beforeAll(async () => {
    app = buildApp({ sockets: false });
    await app.ready();
    signedRequest = createSignedRequest(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with the shared health contract", async () => {
    const res = await signedRequest({ method: "GET", url: `${API}/health` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "ok",
      database: "connected",
      // Redis is disabled under the test env (REDIS_ENABLED=false).
      redis: "disabled",
    });
    expect(res.json().uptime).toBeGreaterThan(0);
    expect(Date.parse(res.json().timestamp)).not.toBeNaN();
  });

  it("requires HMAC and answers with the 401 error envelope", async () => {
    const res = await app.inject({ method: "GET", url: `${API}/health` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({
      success: false,
      status: "error",
      errorType: "HMAC_ERROR",
      error_code: 401,
    });
  });

  it("answers an unknown signed API route with the 404 envelope", async () => {
    const res = await signedRequest({ method: "GET", url: `${API}/does-not-exist` });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ status: "error", errorType: "NOT_FOUND" });
  });

  it("serves the generated OpenAPI document without weakening API HMAC checks", async () => {
    const docs = await app.inject({ method: "GET", url: "/docs/json" });
    expect(docs.statusCode).toBe(200);
    const spec = docs.json();

    expect(spec.security).toBeUndefined();
    expect(spec.components.securitySchemes).toEqual({
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });
    expect(spec.paths[`${API}/auth/me`].get.responses["401"].description).toBe(
      "A valid access token is required",
    );
    expect(spec.paths[`${API}/auth/me`].get.responses["401"].content).toBeUndefined();
    expect(spec.paths[`${API}/auth/refresh`].post.requestBody.required).toBe(false);
    expect(spec.paths[`${API}/auth/register`].post.requestBody.required).toBe(true);
    expect(spec.paths[`${API}/auth/register`].post.security).toBeUndefined();
    expect(spec.paths[`${API}/auth/me`].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths[`${API}/users/`].get.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths[`${API}/users/{id}`].get.security).toEqual([{ bearerAuth: [] }]);

    // The signing secret is only exposed in development, never under the test env.
    expect((await app.inject({ method: "GET", url: "/docs/hmac-config.js" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `${API}/health` })).statusCode).toBe(401);
  });

  it("serves Swagger UI without HMAC headers", async () => {
    const ui = await app.inject({ method: "GET", url: "/docs/" });
    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
  });

  it("titles the OpenAPI document from APP_NAME, falling back to the default", async () => {
    const original = config.appName;
    try {
      config.appName = "Acme API";
      const named = buildApp({ sockets: false });
      await named.ready();
      expect((await named.inject({ method: "GET", url: "/docs/json" })).json().info.title).toBe(
        "Acme API",
      );
      await named.close();

      config.appName = "";
      const fallback = buildApp({ sockets: false });
      await fallback.ready();
      expect((await fallback.inject({ method: "GET", url: "/docs/json" })).json().info.title).toBe(
        "Fastify Starter API",
      );
      await fallback.close();
    } finally {
      config.appName = original;
    }
  });
});
