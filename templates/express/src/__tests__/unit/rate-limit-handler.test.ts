import { errorHandler } from "@/middleware/error-handler";
import { rateLimitHandler } from "@/middleware/rate-limit";
import { describe, expect, it } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

describe("rateLimitHandler", () => {
  it("answers a tripped limit with the standard 429 error envelope", async () => {
    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 1, handler: rateLimitHandler("Slow down!") }));
    app.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);

    expect((await request(app).get("/")).status).toBe(200);
    const res = await request(app).get("/");
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      status: "error",
      errorType: "RATE_LIMIT",
      message: "Slow down!",
      error_code: 429,
      error_message: "Slow down!",
    });
  });
});
