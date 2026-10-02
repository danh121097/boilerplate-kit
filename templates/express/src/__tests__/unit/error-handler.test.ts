import { config } from "@/config/environment";
import { errorHandler } from "@/middleware/error-handler";
import { AppError } from "@/types";
import { describe, it, expect, vi } from "vitest";
import mongoose from "mongoose";

// Stack-trace inclusion is driven by config.isDevelopment (computed once at load),
// so tests toggle the config value rather than mutating process.env at runtime.

const createMockRes = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe("errorHandler", () => {
  const mockReq = {} as any;
  const mockNext = vi.fn();

  it("returns correct status and JSON for AppError", () => {
    const res = createMockRes();
    const err = new AppError({
      message: "Not found!",
      statusCode: 404,
      errorType: "NOT_FOUND",
    });
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errorType: "NOT_FOUND",
        message: "Not found!",
      }),
    );
  });

  it("defaults to 500 when no statusCode", () => {
    const res = createMockRes();
    const err = { message: "boom" } as any;
    errorHandler(err, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("includes stack trace for a 5xx in development mode", () => {
    const original = config.isDevelopment;
    config.isDevelopment = true;
    try {
      const res = createMockRes();
      errorHandler(new Error("dev boom") as any, mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].stack).toBeDefined();
    } finally {
      config.isDevelopment = original;
    }
  });

  it("excludes stack trace for a 4xx in development mode", () => {
    const original = config.isDevelopment;
    config.isDevelopment = true;
    try {
      const res = createMockRes();
      const err = new AppError({
        message: "dev error!",
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
      errorHandler(err, mockReq, res, mockNext);
      expect(res.json.mock.calls[0][0].stack).toBeUndefined();
    } finally {
      config.isDevelopment = original;
    }
  });

  it("excludes stack trace for a 5xx outside development mode", () => {
    const original = config.isDevelopment;
    config.isDevelopment = false;
    try {
      const res = createMockRes();
      errorHandler(new Error("prod boom") as any, mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json.mock.calls[0][0].stack).toBeUndefined();
    } finally {
      config.isDevelopment = original;
    }
  });

  it("maps a body-parser parse failure to 400 without echoing parser text", () => {
    const res = createMockRes();
    const err = Object.assign(new SyntaxError("Unexpected token 's' in JSON at position 1"), {
      statusCode: 400,
      type: "entity.parse.failed",
    });
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
    expect(jsonArg.message).toBe("Malformed JSON request body!");
    expect(jsonArg.error_message).toBe("Malformed JSON request body!");
  });

  it.each([
    ["encoding.unsupported", 415],
    ["charset.unsupported", 415],
    ["request.aborted", 400],
    ["request.size.invalid", 400],
    ["stream.encoding.set", 400],
    ["parameters.too.many", 400],
  ])(
    "maps body-parser type %s to %i VALIDATION_ERROR without echoing parser text",
    (type, status) => {
      const res = createMockRes();
      const raw = `unsupported content encoding "x-secret-${type}"`;
      const err = Object.assign(new Error(raw), { statusCode: 500, type });
      errorHandler(err as any, mockReq, res, mockNext);
      expect(res.status).toHaveBeenCalledWith(status);
      const jsonArg = res.json.mock.calls[0][0];
      expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
      expect(jsonArg.message).toBe(jsonArg.error_message);
      expect(jsonArg.message).not.toContain("x-secret");
      expect(jsonArg.message).not.toContain(type);
    },
  );

  it("leaves an unknown body-parser type to the generic handling", () => {
    const res = createMockRes();
    const err = Object.assign(new Error("raw parser text"), {
      statusCode: 500,
      type: "constructor",
    });
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe("Internal Server Error!");
  });

  it.each([
    ["zlib", { code: "Z_DATA_ERROR", errno: -3, status: 400 }, 400],
    ["brotli", { code: "ERR_BROTLI_DECOMPRESSION_FAILED" }, 400],
    ["untabled 4xx parser type", { type: "something.new", status: 422 }, 422],
    ["exposed 4xx", { expose: true, statusCode: 400 }, 400],
  ])("maps a %s body-reading error to a fixed message", (_name, props, status) => {
    const res = createMockRes();
    const err = Object.assign(new Error("incorrect header check at /srv/x"), props);
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(status);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
    expect(jsonArg.message).toBe("Request body could not be read!");
    expect(jsonArg.message).toBe(jsonArg.error_message);
  });

  it("maps a body-parser size failure to 413 VALIDATION_ERROR", () => {
    const res = createMockRes();
    const err = Object.assign(new Error("request entity too large"), {
      statusCode: 413,
      type: "entity.too.large",
    });
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(413);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
    expect(jsonArg.message).toBe("Request body is too large!");
  });

  it('falls back to "Internal Server Error" when no message', () => {
    const res = createMockRes();
    const err = { statusCode: 500 } as any;
    errorHandler(err, mockReq, res, mockNext);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.message).toBe("Internal Server Error!");
  });

  it("hides the raw message of a non-AppError 5xx", () => {
    const res = createMockRes();
    errorHandler(new Error("connect ECONNREFUSED 10.0.0.5:27017") as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(500);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.message).toBe("Internal Server Error!");
    expect(jsonArg.error_message).toBe("Internal Server Error!");
    expect(jsonArg.errorType).toBe("INTERNAL_ERROR");
  });

  it("keeps the message of an intentional AppError 5xx", () => {
    const res = createMockRes();
    errorHandler(
      new AppError({ message: "Upstream unavailable!", statusCode: 503 }),
      mockReq,
      res,
      mockNext,
    );
    expect(res.json.mock.calls[0][0].message).toBe("Upstream unavailable!");
  });

  it("keeps the message of a non-AppError 4xx (e.g. body-parser)", () => {
    const res = createMockRes();
    errorHandler(
      { message: "request entity too large", statusCode: 413 } as any,
      mockReq,
      res,
      mockNext,
    );
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json.mock.calls[0][0].message).toBe("request entity too large");
  });

  it("maps a Mongoose CastError to 400 VALIDATION_ERROR without the raw value", () => {
    const res = createMockRes();
    const err = new mongoose.Error.CastError("ObjectId", "not-an-id", "_id");
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
    expect(jsonArg.message).toBe("Invalid value for _id!");
    expect(jsonArg.message).not.toContain("not-an-id");
  });

  it("maps a Mongoose ValidationError to 400 VALIDATION_ERROR", () => {
    const res = createMockRes();
    const err = new mongoose.Error.ValidationError();
    err.addError("name", new mongoose.Error.ValidatorError({ path: "name", message: "required" }));
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("VALIDATION_ERROR");
    expect(jsonArg.message).toBe("Invalid value for name!");
  });

  it("maps a Mongo duplicate-key error (11000) to 409 CONFLICT naming only the field", () => {
    const res = createMockRes();
    const err = Object.assign(
      new Error(
        'E11000 duplicate key error collection: app.users index: email_1 dup key: { email: "a@b.com" }',
      ),
      { code: 11000, keyPattern: { email: 1 }, keyValue: { email: "a@b.com" } },
    );
    errorHandler(err as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.errorType).toBe("CONFLICT");
    expect(jsonArg.message).toBe("Duplicate value for email!");
    expect(jsonArg.message).not.toContain("a@b.com");
  });

  it("maps a duplicate-key error without keyPattern to a generic 409", () => {
    const res = createMockRes();
    errorHandler({ code: 11000, message: "E11000" } as any, mockReq, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toBe("Resource already exists!");
  });
});
