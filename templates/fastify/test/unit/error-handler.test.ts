import { config } from "@/config/environment";
import { installErrorHandlers } from "@/plugins/error-handlers";
import { AppError } from "@/types";
import compress from "@fastify/compress";
import Fastify from "fastify";
import mongoose from "mongoose";

/** App whose only route throws `error`, behind the real error handler. */
async function respondTo(error: unknown) {
  const app = Fastify();
  installErrorHandlers(app);
  app.get("/boom", async () => {
    throw error;
  });
  const res = await app.inject({ method: "GET", url: "/boom" });
  await app.close();
  return { status: res.statusCode, body: res.json() };
}

describe("error handler", () => {
  it("returns the status and envelope of an AppError", async () => {
    const { status, body } = await respondTo(
      new AppError({ message: "Not found!", statusCode: 404, errorType: "NOT_FOUND" }),
    );
    expect(status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      status: "error",
      errorType: "NOT_FOUND",
      message: "Not found!",
      error_code: 404,
      error_message: "Not found!",
    });
  });

  it("defaults to 500 INTERNAL_ERROR for an unknown error", async () => {
    const { status, body } = await respondTo(new Error("boom"));
    expect(status).toBe(500);
    expect(body.errorType).toBe("INTERNAL_ERROR");
  });

  it("includes the stack only in development", async () => {
    const original = config.isDevelopment;
    try {
      config.isDevelopment = true;
      expect((await respondTo(new Error("dev boom"))).body.stack).toEqual(expect.any(String));
      config.isDevelopment = false;
      expect((await respondTo(new Error("prod boom"))).body.stack).toBeUndefined();
    } finally {
      config.isDevelopment = original;
    }
  });

  it("never adds a stack to a client error, even in development", async () => {
    const original = config.isDevelopment;
    config.isDevelopment = true;
    try {
      const { body } = await respondTo(
        new AppError({ message: "bad", statusCode: 400, errorType: "VALIDATION_ERROR" }),
      );
      expect(body.stack).toBeUndefined();
    } finally {
      config.isDevelopment = original;
    }
  });

  it("hides the raw message of a non-AppError 5xx", async () => {
    const { status, body } = await respondTo(new Error("connect ECONNREFUSED 10.0.0.5:27017"));
    expect(status).toBe(500);
    expect(body.message).toBe("Internal Server Error!");
    expect(body.error_message).toBe("Internal Server Error!");
    expect(body.errorType).toBe("INTERNAL_ERROR");
  });

  it("falls back to the generic message when an error has none", async () => {
    const { body } = await respondTo(Object.assign(new Error(""), { statusCode: 500 }));
    expect(body.message).toBe("Internal Server Error!");
  });

  it("keeps the message of an intentional AppError 5xx", async () => {
    const { status, body } = await respondTo(
      new AppError({ message: "Upstream unavailable!", statusCode: 503 }),
    );
    expect(status).toBe(503);
    expect(body.message).toBe("Upstream unavailable!");
  });

  it("keeps the message of a non-AppError 4xx", async () => {
    const { status, body } = await respondTo(
      Object.assign(new Error("Too many requests"), { statusCode: 429 }),
    );
    expect(status).toBe(429);
    expect(body).toMatchObject({ errorType: "RATE_LIMIT", message: "Too many requests" });
  });

  it("maps a Mongoose CastError to 400 VALIDATION_ERROR without the raw value", async () => {
    const { status, body } = await respondTo(
      new mongoose.Error.CastError("ObjectId", "not-an-id", "_id"),
    );
    expect(status).toBe(400);
    expect(body.errorType).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Invalid value for _id!");
    expect(body.message).not.toContain("not-an-id");
  });

  it("maps a Mongoose ValidationError to 400 VALIDATION_ERROR", async () => {
    const err = new mongoose.Error.ValidationError();
    err.addError("name", new mongoose.Error.ValidatorError({ path: "name", message: "required" }));
    const { status, body } = await respondTo(err);
    expect(status).toBe(400);
    expect(body.errorType).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Invalid value for name!");
  });

  it("maps a Mongo duplicate-key error (11000) to 409 CONFLICT naming only the field", async () => {
    const err = Object.assign(
      new Error(
        'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "a@b.com" }',
      ),
      { code: 11000, keyPattern: { email: 1 }, keyValue: { email: "a@b.com" } },
    );
    const { status, body } = await respondTo(err);
    expect(status).toBe(409);
    expect(body.errorType).toBe("CONFLICT");
    expect(body.message).toBe("Duplicate value for email!");
    expect(body.message).not.toContain("a@b.com");
  });

  it("maps a duplicate-key error without keyPattern to a generic 409", async () => {
    const { status, body } = await respondTo(Object.assign(new Error("E11000"), { code: 11000 }));
    expect(status).toBe(409);
    expect(body.message).toBe("Resource already exists!");
  });
});

describe("request body failures", () => {
  const MALFORMED = "Malformed JSON request body!";
  const UNREADABLE = "Request body could not be read!";

  /** The real compress + content-type parser pipeline behind the real error handler. */
  async function post(headers: Record<string, string | undefined>, payload: string | Buffer) {
    const app = Fastify({ bodyLimit: 1024 });
    await app.register(compress);
    installErrorHandlers(app);
    app.post("/echo", async (request) => ({ body: request.body }));
    const res = await app.inject({ method: "POST", url: "/echo", headers, payload });
    await app.close();
    return { status: res.statusCode, body: res.json() };
  }

  it.each([
    {
      name: "invalid JSON",
      headers: { "content-type": "application/json" },
      payload: "{not json",
      status: 400,
      message: MALFORMED,
    },
    {
      name: "an empty body declared as JSON",
      headers: { "content-type": "application/json" },
      payload: "",
      status: 400,
      message: MALFORMED,
    },
    {
      name: "an oversized body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ filler: "x".repeat(2048) }),
      status: 413,
      message: "Request body is too large!",
    },
    {
      name: "an unsupported content type",
      headers: { "content-type": "application/x-secret-type" },
      payload: "{}",
      status: 415,
      message: "Unsupported request content type!",
    },
    {
      name: "an unsupported content encoding",
      headers: { "content-type": "application/json", "content-encoding": "x-secret-encoding" },
      payload: "{}",
      status: 415,
      message: "Unsupported request content encoding!",
    },
    {
      name: "a corrupt compressed body",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      payload: "definitely not gzip",
      status: 400,
      message: UNREADABLE,
    },
    {
      name: "a corrupt brotli body",
      headers: { "content-type": "application/json", "content-encoding": "br" },
      payload: "definitely not brotli",
      status: 400,
      message: UNREADABLE,
    },
    {
      name: "a JSON body in an unsupported charset",
      headers: { "content-type": "application/json; charset=ISO-8859-1" },
      payload: "{}",
      status: 415,
      message: "Unsupported request charset!",
    },
    {
      name: "a body that disagrees with its Content-Length",
      headers: { "content-type": "application/json", "content-length": "5" },
      payload: JSON.stringify({ a: 1, b: 2, c: 3 }),
      status: 400,
      message: UNREADABLE,
    },
  ])("answers $name with $status and a fixed message", async (c) => {
    const { status, body } = await post(c.headers, c.payload);
    expect(status).toBe(c.status);
    expect(body).toMatchObject({
      success: false,
      errorType: "VALIDATION_ERROR",
      message: c.message,
      error_message: c.message,
      error_code: c.status,
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|gzip|Unexpected|JSON\.parse/i);
  });

  it("ignores the charset of a request that carries no body", async () => {
    const app = Fastify();
    installErrorHandlers(app);
    app.get("/ok", async () => ({ ok: true }));
    const headers = { "content-type": "application/json; charset=latin1" };
    const res = await app.inject({ method: "GET", url: "/ok", headers });
    await app.close();
    expect(res.statusCode).toBe(200);
  });
});
