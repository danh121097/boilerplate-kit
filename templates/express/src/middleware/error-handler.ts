import { config } from "@/config/environment";
import { AppError } from "@/types";
import { logger } from "@/utils/logger";
import { NextFunction, Request, Response } from "express";

/** Global error handling middleware — must be registered last */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  // 5xx are server faults worth a stack; 4xx are expected client errors → warn.
  if (statusCode >= 500) logger.error(err.message, { statusCode, err });
  else logger.warn(err.message, { statusCode });

  const message = err.message || "Internal Server Error!";
  const errorType = err.errorType || "INTERNAL_ERROR";

  res.status(statusCode).json({
    success: false,
    status: "error",
    errorType,
    message,
    // Mirror message/code under the field names the client error type expects.
    error_code: statusCode,
    error_message: message,
    ...(config.isDevelopment && { stack: err.stack }),
  });
}
