/**
 * E2E — HTTP setup shared with main.ts (configureApp) and request-edge behavior:
 *   - CORS preflight allows the HMAC headers `sig` / `ctime`
 *   - body-parser failures (too large, malformed JSON) answer 413 / 400 in the
 *     standard error envelope, not 500, and are not logged at error level
 *   - Zod validation failures carry the issue messages joined with ", "
 *   - unmatched routes answer 404 in the standard envelope
 *   - bodyless refresh/logout behave like `{}`; an empty body token falls back to the cookie
 *   - the test server is bound to loopback, so supertest never opens a wildcard
 *     port per request that a foreign 127.0.0.1 listener could shadow
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import supertest from "supertest";

import { AppModule } from "@/app.module";
import { AppLogger } from "@/common/logger/app-logger.service";
import { NotFoundModule } from "@/modules/not-found/not-found.module";
import { INestApplication } from "@nestjs/common";
import { createTestApp, TEST_HOST } from "../helpers/create-test-app";
import { buildHmacHeaders } from "../helpers/sign-request";

let app: INestApplication;
let req: ReturnType<typeof supertest>;

beforeAll(async () => {
  app = await createTestApp();
  req = supertest(app.getHttpServer());
}, 30_000);

afterAll(async () => {
  await app.close();
});

function signedPost(path: string, body?: unknown) {
  const h = buildHmacHeaders("POST", path, body);
  const request = req.post(`/api/v1${path}`).set("sig", h.sig).set("ctime", h.ctime);
  return body === undefined
    ? request
    : request.set("Content-Type", "application/json").send(body as object);
}

const ALLOWED_ORIGIN = "http://localhost:5173";
const ENVELOPE = { success: false, status: "error" };

describe("Test server binding", () => {
  it("listens on a loopback port before any request is made", () => {
    const addr = (app.getHttpServer() as import("http").Server).address();
    expect(addr).toMatchObject({ address: TEST_HOST });
  });
});

describe("CORS preflight", () => {
  it("allows the sig and ctime request headers for an allowed origin", async () => {
    const res = await req
      .options("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "sig,ctime,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowed = String(res.headers["access-control-allow-headers"]).toLowerCase();
    expect(allowed).toContain("sig");
    expect(allowed).toContain("ctime");
  });
});

describe("body-parser errors", () => {
  it("answers 413 in the standard envelope for an oversized body, without an error log", async () => {
    const errorLog = vi.spyOn(AppLogger.prototype, "error");
    try {
      const res = await req
        .post("/api/v1/auth/login")
        .set("Origin", ALLOWED_ORIGIN)
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ email: "a@example.com", password: "x".repeat(200_000) }));

      expect(res.status).toBe(413);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "VALIDATION_ERROR",
        message: "Request body is too large!",
        error_code: 413,
      });
      expect(res.body.error_message).toBe(res.body.message);
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("answers 400 in the standard envelope for malformed JSON, without an error log", async () => {
    const errorLog = vi.spyOn(AppLogger.prototype, "error");
    try {
      const res = await req
        .post("/api/v1/auth/login")
        .set("Origin", ALLOWED_ORIGIN)
        .set("Content-Type", "application/json")
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "VALIDATION_ERROR",
        message: "Malformed JSON request body!",
        error_code: 400,
      });
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });
});

describe("other body-parser error types", () => {
  it("answers 415 VALIDATION_ERROR with a fixed message for an unsupported content encoding", async () => {
    const res = await req
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "x-unknown")
      .send("{}");

    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      ...ENVELOPE,
      errorType: "VALIDATION_ERROR",
      message: "Unsupported request content encoding!",
      error_code: 415,
    });
  });
});

describe("undecodable compressed bodies", () => {
  it.each(["gzip", "br", "deflate"])(
    "answers 400 with a fixed message for a plain body labelled Content-Encoding: %s",
    async (encoding) => {
      const errorLog = vi.spyOn(AppLogger.prototype, "error");
      const warnLog = vi.spyOn(AppLogger.prototype, "warn");
      try {
        const body = { email: "a@example.com", password: "Password1!" };
        const h = buildHmacHeaders("POST", "/auth/login", body);
        const res = await req
          .post("/api/v1/auth/login")
          .set("sig", h.sig)
          .set("ctime", h.ctime)
          .set("Content-Type", "application/json")
          .set("Content-Encoding", encoding)
          .send(JSON.stringify(body));

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({
          ...ENVELOPE,
          errorType: "VALIDATION_ERROR",
          message: "Request body could not be read!",
          error_code: 400,
        });
        expect(errorLog).not.toHaveBeenCalled();
        const logged = JSON.stringify(warnLog.mock.calls);
        expect(logged).not.toMatch(/header check|decompress|incorrect|zlib/i);
      } finally {
        errorLog.mockRestore();
        warnLog.mockRestore();
      }
    },
  );
});

describe("validation messages", () => {
  it("returns the Zod issue message, like the express validator", async () => {
    const res = await signedPost("/auth/login", { email: "not-an-email", password: "x" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      ...ENVELOPE,
      errorType: "VALIDATION_ERROR",
      message: "Invalid email format",
      error_message: "Invalid email format",
      error_code: 400,
    });
  });

  it("joins several issue messages with a comma", async () => {
    const res = await signedPost("/auth/register", { email: "bad", password: "short", name: " " });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Invalid email format, Password must be at least 8 characters, Name is required",
    );
  });
});

describe("unmatched routes", () => {
  it("catch-all module is the last AppModule import, so it never shadows another module", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];
    expect(imports.at(-1)).toBe(NotFoundModule);
  });

  it.each(["GET", "POST"] as const)(
    "%s signed answers 404 NOT_FOUND with the express message",
    async (method) => {
      const h = buildHmacHeaders(method, "/no-such-route");
      const res = await req[method.toLowerCase() as "get" | "post"]("/api/v1/no-such-route")
        .set("sig", h.sig)
        .set("ctime", h.ctime);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "NOT_FOUND",
        message: "Resource not found!",
        error_message: "Resource not found!",
        error_code: 404,
      });
    },
  );

  it.each(["/api/v1", "/api/v1/"])("%s unsigned answers 401 HMAC_ERROR", async (url) => {
    const res = await req.get(url);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ...ENVELOPE, errorType: "HMAC_ERROR" });
  });

  it.each(["get", "post", "delete"] as const)(
    "bare prefix %s signed answers 404 NOT_FOUND with the express message",
    async (method) => {
      const h = buildHmacHeaders(method, "/");
      const res = await req[method]("/api/v1").set("sig", h.sig).set("ctime", h.ctime);

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "NOT_FOUND",
        message: "Resource not found!",
      });
    },
  );

  it("outside the API prefix answers the express message, not Nest's Cannot GET", async () => {
    const res = await req.get("/no-such-route");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      ...ENVELOPE,
      errorType: "NOT_FOUND",
      message: "Resource not found!",
      error_message: "Resource not found!",
      error_code: 404,
    });
  });

  it("unsigned answers 401 HMAC_ERROR, not a 404 that leaks which routes exist", async () => {
    const res = await req.get("/api/v1/no-such-route");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ...ENVELOPE, errorType: "HMAC_ERROR", error_code: 401 });
  });
});

describe("refresh / logout body handling", () => {
  it.each(["/auth/refresh", "/auth/logout"])(
    "%s rejects a non-string refreshToken with the shared message",
    async (path) => {
      const res = await signedPost(path, { refreshToken: 123 });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({
        ...ENVELOPE,
        errorType: "VALIDATION_ERROR",
        message: "refreshToken must be a string",
      });
    },
  );

  it("bodyless refresh uses the refresh cookie", async () => {
    const reg = await signedPost("/auth/register", {
      email: "bodyless@example.com",
      password: "Bodyless1!",
      name: "Bodyless",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/refresh").set("Cookie", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.refreshToken).toBeTypeOf("string");
  });

  it("bodyless refresh without a cookie is a 401 in the standard envelope", async () => {
    const res = await signedPost("/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ...ENVELOPE, errorType: "AUTHENTICATION_ERROR" });
  });

  it("bodyless logout returns 200 and revokes the cookie token", async () => {
    const reg = await signedPost("/auth/register", {
      email: "bodyless-out@example.com",
      password: "Bodyless1!",
      name: "Bodyless Out",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/logout").set("Cookie", `refreshToken=${refreshToken}`);
    expect(res.status).toBe(200);

    const replay = await signedPost("/auth/refresh", { refreshToken });
    expect(replay.status).toBe(401);
  });

  it("an empty body refreshToken falls back to the cookie", async () => {
    const reg = await signedPost("/auth/register", {
      email: "empty-body@example.com",
      password: "EmptyBody1!",
      name: "Empty Body",
    });
    const refreshToken = reg.body.data.tokens.refreshToken as string;

    const res = await signedPost("/auth/refresh", { refreshToken: "" }).set(
      "Cookie",
      `refreshToken=${refreshToken}`,
    );
    expect(res.status).toBe(200);
  });
});
