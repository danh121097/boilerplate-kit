import { afterAll, beforeAll, describe, expect, it } from "vitest";
import supertest from "supertest";

import type { INestApplication } from "@nestjs/common";
import { createTestApp } from "../helpers/create-test-app";

describe("Swagger documentation", () => {
  let app: INestApplication;
  let req: ReturnType<typeof supertest>;

  beforeAll(async () => {
    app = await createTestApp({ swagger: true });
    req = supertest(app.getHttpServer());
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it("serves the UI and OpenAPI document at the shared backend paths", async () => {
    const [ui, document] = await Promise.all([req.get("/docs/"), req.get("/docs/json")]);

    expect(ui.status).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
    expect(ui.text).toContain("Swagger UI");

    expect(document.status).toBe(200);
    expect(document.body.paths["/api/v1/auth/register"].post.tags).toContain("auth");
    expect(document.body.security).toBeUndefined();
    expect(document.body.paths["/api/v1/auth/me"].get.responses["401"].description).toBe(
      "A valid access token is required",
    );
    expect(document.body.components.securitySchemes).toEqual({
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    });
    expect(document.body.paths["/api/v1/auth/register"].post.security).toBeUndefined();
    expect(document.body.paths["/api/v1/auth/me"].get.security).toEqual([{ bearerAuth: [] }]);

    const hmacConfig = await req.get("/swagger-hmac-config.js");
    expect(hmacConfig.status).toBe(404);
    expect((await req.get("/api/v1/health")).status).toBe(401);
  });
});
