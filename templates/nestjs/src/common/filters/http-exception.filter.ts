import { AppException, ErrorType } from "@/common/exceptions/app.exception";
import { AppLogger } from "@/common/logger/app-logger.service";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Global exception filter — renders the EXACT same JSON envelope as express
 * error-handler.ts and not-found-handler.ts so clients have a single contract.
 *
 * Envelope shape (all cases):
 *   { success: false, status: "error", errorType, message,
 *     error_code, error_message, stack? (dev only) }
 *
 * 5xx → logger.error with stack; 4xx → logger.warn.
 * Unmatched routes produce Nest's default NotFoundException (404) which is
 * caught here and rendered with NOT_FOUND errorType — matching not-found-handler.ts.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isDev = process.env.NODE_ENV !== "production";

    let statusCode: number;
    let message: string;
    let errorType: ErrorType;
    let stack: string | undefined;

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      message = exception.message;
      errorType = exception.errorType;
      stack = exception.stack;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      // Nest wraps messages in { message, statusCode } objects — unwrap to string.
      const resp = exception.getResponse();
      if (typeof resp === "string") {
        message = resp;
      } else if (typeof resp === "object" && resp !== null && "message" in resp) {
        const raw = (resp as { message: unknown }).message;
        message = Array.isArray(raw) ? raw.join("; ") : String(raw);
      } else {
        message = exception.message;
      }
      // Map well-known Nest 4xx status codes to express-equivalent errorType strings.
      errorType = mapHttpStatusToErrorType(statusCode);
      stack = exception.stack;
    } else {
      // Unexpected non-HTTP error — treat as 500.
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Internal Server Error!";
      errorType = "INTERNAL_ERROR";
      stack = exception instanceof Error ? exception.stack : undefined;
    }

    // Log severity mirrors express error-handler.ts: 5xx=error, 4xx=warn.
    if (statusCode >= 500) {
      this.logger.error(`${req.method} ${req.url} → ${statusCode}: ${message}`, stack);
    } else {
      this.logger.warn(`${req.method} ${req.url} → ${statusCode}: ${message}`);
    }

    // Exact envelope from express error-handler.ts + not-found-handler.ts.
    res.status(statusCode).json({
      success: false,
      status: "error",
      errorType,
      message,
      error_code: statusCode,
      error_message: message,
      ...(isDev && stack ? { stack } : {}),
    });
  }
}

/** Map HTTP status codes to express-style ErrorType strings. */
function mapHttpStatusToErrorType(status: number): ErrorType {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "AUTHENTICATION_ERROR";
    case 403:
      return "AUTHORIZATION_ERROR";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMIT";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR";
  }
}
