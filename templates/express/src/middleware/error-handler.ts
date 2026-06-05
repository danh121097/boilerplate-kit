import { NextFunction, Request, Response } from "express";
import { config } from "@/config/environment";
import { AppError } from "@/types";

/** Global error handling middleware — must be registered last */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  console.error(`[Error] ${statusCode}: ${err.message}`);

  res.status(statusCode).json({
    success: false,
    errorType: err.errorType || "INTERNAL_ERROR",
    message: err.message || "Internal Server Error!",
    ...(config.isDevelopment && { stack: err.stack }),
  });
}
