import { config } from "@/config/environment";
import { AppError } from "@/types";
import { logger } from "@/utils/logger";
import { mapDatabaseError } from "@/utils/map-database-error";
import type { FastifyError, FastifyInstance } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";

const GENERIC_SERVER_ERROR = "Internal Server Error!";

export function installErrorHandlers(
  app: FastifyInstance<import("fastify").RawServerDefault, IncomingMessage, ServerResponse>,
): void {
  app.setErrorHandler((err: FastifyError, _request, reply) => {
    let error = err instanceof AppError ? err : mapDatabaseError(err);
    if (!error && err.code === "FST_ERR_VALIDATION") {
      const issues = err.validation?.map((issue) => issue.message).filter(Boolean) ?? [];
      error = new AppError({
        message: issues.join(", ") || "Request validation failed!",
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
    }
    if (!error && err.code === "FST_ERR_CTP_INVALID_JSON_BODY") {
      error = new AppError({
        message: "Malformed JSON request body!",
        statusCode: 400,
        errorType: "VALIDATION_ERROR",
      });
    }
    if (!error && err.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      error = new AppError({
        message: "Request body is too large!",
        statusCode: 413,
        errorType: "VALIDATION_ERROR",
      });
    }

    const statusCode = error?.statusCode ?? err.statusCode ?? 500;
    const errorType = error?.errorType ?? (statusCode === 429 ? "RATE_LIMIT" : "INTERNAL_ERROR");
    if (statusCode >= 500) {
      logger.error("Request failed", {
        statusCode,
        errorName: err.name,
        errorCode: err.code,
      });
    } else {
      logger.warn(error?.message ?? err.message, { statusCode });
    }

    const trustedMessage = error?.message ?? (statusCode < 500 ? err.message : undefined);
    const message = trustedMessage || GENERIC_SERVER_ERROR;
    return reply.status(statusCode).send({
      success: false,
      status: "error",
      errorType,
      message,
      error_code: statusCode,
      error_message: message,
      ...(config.isDevelopment && statusCode >= 500 ? { stack: err.stack } : {}),
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    const message = "Resource not found!";
    return reply.status(404).send({
      success: false,
      status: "error",
      errorType: "NOT_FOUND",
      message,
      error_code: 404,
      error_message: message,
    });
  });
}
