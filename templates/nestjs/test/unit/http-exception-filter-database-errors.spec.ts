/**
 * HttpExceptionFilter — Mongoose/MongoDB errors must not surface as 500s or leak
 * driver internals. Mirrors express error-handler tests.
 */
import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { HttpExceptionFilter } from "@/common/filters/http-exception.filter";
import { AppLogger } from "@/common/logger/app-logger.service";
import { ArgumentsHost } from "@nestjs/common";

function run(exception: unknown): { status: number; body: Record<string, unknown> } {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => ({ method: "GET", url: "/x" }),
    }),
  } as unknown as ArgumentsHost;
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as AppLogger;
  new HttpExceptionFilter(logger).catch(exception, host);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe("HttpExceptionFilter — database errors", () => {
  it("maps CastError → 400 VALIDATION_ERROR without the raw value", () => {
    const { status, body } = run(new mongoose.Error.CastError("ObjectId", "not-an-id", "_id"));
    expect(status).toBe(400);
    expect(body.errorType).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Invalid value for _id!");
  });

  it("maps ValidationError → 400 VALIDATION_ERROR", () => {
    const err = new mongoose.Error.ValidationError();
    err.addError("name", new mongoose.Error.ValidatorError({ path: "name", message: "required" }));
    const { status, body } = run(err);
    expect(status).toBe(400);
    expect(body.errorType).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Invalid value for name!");
  });

  it("maps duplicate key (11000) → 409 CONFLICT naming only the field", () => {
    const err = Object.assign(
      new Error(
        'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "a@b.com" }',
      ),
      { code: 11000, keyPattern: { email: 1 }, keyValue: { email: "a@b.com" } },
    );
    const { status, body } = run(err);
    expect(status).toBe(409);
    expect(body.errorType).toBe("CONFLICT");
    expect(body.message).toBe("Duplicate value for email!");
  });

  it("maps duplicate key without keyPattern → generic 409", () => {
    const { status, body } = run({ code: 11000 });
    expect(status).toBe(409);
    expect(body.message).toBe("Resource already exists!");
  });

  it("keeps any other non-HTTP error a generic 500", () => {
    const { status, body } = run(new Error("connect ECONNREFUSED 10.0.0.5:27017"));
    expect(status).toBe(500);
    expect(body.message).toBe("Internal Server Error!");
  });
});
