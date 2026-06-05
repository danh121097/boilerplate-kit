import { config } from "@/config/environment";
import { errorHandler } from "@/middleware/error-handler";
import { AppError } from "@/types";
import { describe, it, expect, vi } from "vitest";

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

  it("includes stack trace in development mode", () => {
    const original = config.isDevelopment;
    config.isDevelopment = true;
    const res = createMockRes();
    const err = new AppError({
      message: "dev error!",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
    errorHandler(err, mockReq, res, mockNext);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeDefined();
    config.isDevelopment = original;
  });

  it("excludes stack trace in production mode", () => {
    const original = config.isDevelopment;
    config.isDevelopment = false;
    const res = createMockRes();
    const err = new AppError({
      message: "prod error!",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
    errorHandler(err, mockReq, res, mockNext);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.stack).toBeUndefined();
    config.isDevelopment = original;
  });

  it('falls back to "Internal Server Error" when no message', () => {
    const res = createMockRes();
    const err = { statusCode: 500 } as any;
    errorHandler(err, mockReq, res, mockNext);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.message).toBe("Internal Server Error");
  });
});
