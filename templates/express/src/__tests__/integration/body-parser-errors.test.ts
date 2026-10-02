import { signHmac } from "@/__tests__/helpers/hmac-sign";
import { closeServer, listenOnLoopback } from "@/__tests__/helpers/loopback-server";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import type { Server } from "http";
import app from "@/app";
import request from "supertest";

describe("Body-parser errors through the real app", () => {
  let server: Server;
  beforeAll(async () => {
    server = await listenOnLoopback(app);
  });
  afterAll(async () => {
    await closeServer(server);
  });

  const url = "/api/v1/auth/login";

  it("answers malformed JSON with 400 VALIDATION_ERROR", async () => {
    const res = await request(server).post(url).set("Content-Type", "application/json").send("{");
    expect(res.status).toBe(400);
    expect(res.body.errorType).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe("Malformed JSON request body!");
  });

  it("answers a body over the limit with 413 VALIDATION_ERROR", async () => {
    const res = await request(server)
      .post(url)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ pad: "a".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.errorType).toBe("VALIDATION_ERROR");
    expect(res.body.message).toBe("Request body is too large!");
  });

  it.each(["gzip", "br", "deflate"])(
    "answers a plain body labelled Content-Encoding: %s with 400 VALIDATION_ERROR",
    async (encoding) => {
      const body = JSON.stringify({ email: "a@b.com", password: "Passw0rd!" });
      const res = await request(server)
        .post(url)
        .set(signHmac("POST", url, body))
        .set("Content-Type", "application/json")
        .set("Content-Encoding", encoding)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.errorType).toBe("VALIDATION_ERROR");
      expect(res.body.message).toBe("Request body could not be read!");
    },
  );
});
