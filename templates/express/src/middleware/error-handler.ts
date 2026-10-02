import { config } from "@/config/environment";
import { AppError } from "@/types";
import { logger } from "@/utils/logger";
import { mapDatabaseError } from "@/utils/map-database-error";
import { NextFunction, Request, Response } from "express";

const GENERIC_SERVER_ERROR = "Internal Server Error!";

const BODY_PARSER_ERRORS = new Map<string, { statusCode: number; message: string }>(
  Object.entries({
    "entity.parse.failed": { statusCode: 400, message: "Malformed JSON request body!" },
    "entity.too.large": { statusCode: 413, message: "Request body is too large!" },
    "encoding.unsupported": { statusCode: 415, message: "Unsupported request content encoding!" },
    "charset.unsupported": { statusCode: 415, message: "Unsupported request charset!" },
    "request.aborted": { statusCode: 400, message: "Request body could not be read!" },
    "request.size.invalid": { statusCode: 400, message: "Request body could not be read!" },
    "stream.encoding.set": { statusCode: 400, message: "Request body could not be read!" },
    "parameters.too.many": { statusCode: 400, message: "Request body could not be read!" },
  }),
);

const UNREADABLE_BODY = "Request body could not be read!";

/** Fixed message for a 4xx body-parser failure the table does not name, by status. */
function fallbackBodyMessage(statusCode: number): string {
  if (statusCode === 413) return "Request body is too large!";
  if (statusCode === 415) return "Unsupported request content encoding!";
  return UNREADABLE_BODY;
}

/** zlib (gzip/deflate) and brotli decompression failures carry these codes. */
function isDecompressionError(err: object): boolean {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && (code.startsWith("Z_") || code.startsWith("ERR_BROTLI"));
}

/**
 * Map body-parser failures to fixed client-safe AppErrors. The parser's own message
 * can echo request content, so it is never forwarded. Types outside the table fall
 * through unchanged.
 */
function mapBodyParserError(err: unknown): AppError | undefined {
  const type = (err as { type?: unknown } | null)?.type;
  const mapped = typeof type === "string" ? BODY_PARSER_ERRORS.get(type) : undefined;
  if (mapped) return new AppError({ ...mapped, errorType: "VALIDATION_ERROR" });
  if (typeof err !== "object" || err === null) return undefined;
  // Corrupt compressed bodies surface as raw zlib errors (no `type`).
  if (isDecompressionError(err)) {
    return new AppError({
      statusCode: 400,
      message: UNREADABLE_BODY,
      errorType: "VALIDATION_ERROR",
    });
  }
  // Any other body-reading error: http-errors style 4xx with a parser `type` or `expose`.
  const { status, statusCode, expose } = err as Record<string, unknown>;
  const code = typeof status === "number" ? status : statusCode;
  if (
    typeof code === "number" &&
    code >= 400 &&
    code < 500 &&
    (typeof type === "string" || expose === true)
  ) {
    return new AppError({
      statusCode: code,
      message: fallbackBodyMessage(code),
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
