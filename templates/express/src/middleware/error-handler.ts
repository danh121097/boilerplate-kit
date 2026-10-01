import { config } from "@/config/environment";
import { AppError } from "@/types";
import { logger } from "@/utils/logger";
import { mapDatabaseError } from "@/utils/map-database-error";
import { NextFunction, Request, Response } from "express";

const GENERIC_SERVER_ERROR = "Internal Server Error!";

/**
 * Map body-parser failures to fixed client-safe AppErrors. The parser's own message
 * can echo request content, so it is never forwarded.
 */
function mapBodyParserError(err: unknown): AppError | undefined {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") {
    return new AppError({
      message: "Malformed JSON request body!",
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }
  if (type === "entity.too.large") {
    return new AppError({
      message: "Request body is too large!",
      statusCode: 413,
      errorType: "VALIDATION_ERROR",
    });
  }
  return undefined;
}

/**
 * Global error handling middleware — must be registered last.
 *
 * Body-parser and known Mongoose/MongoDB errors are mapped to 400/409 first. Any other non-AppError
 * that ends up as a 5xx gets a generic message: its raw `message` may carry driver,
 * query or stack internals. The original error is still logged server-side. Stack
 * traces are returned only for 5xx in development.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const error =
    err instanceof AppError ? err : (mapBodyParserError(err) ?? mapDatabaseError(err) ?? err);
  const statusCode = error.statusCode || 500;
  // 5xx are server faults worth a stack; 4xx are expected client errors → warn.
  if (statusCode >= 500) logger.error(err.message, { statusCode, err });
  else logger.warn(error.message, { statusCode });

  const isTrusted = error instanceof AppError || statusCode < 500;
  const message = (isTrusted && error.message) || GENERIC_SERVER_ERROR;
  const errorType = error.errorType || "INTERNAL_ERROR";

  res.status(statusCode).json({
    success: false,
    status: "error",
    errorType,
    message,
    // Mirror message/code under the field names the client error type expects.
    error_code: statusCode,
    error_message: message,
    ...(config.isDevelopment && statusCode >= 500 && { stack: err.stack }),
  });
}
