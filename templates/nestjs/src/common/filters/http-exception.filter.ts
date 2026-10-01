import { AppException, ErrorType } from "@/common/exceptions/app.exception";
import { mapBodyParserError } from "@/common/filters/map-body-parser-error";
import { mapDatabaseError } from "@/common/filters/map-database-error";
import { AppLogger } from "@/common/logger/app-logger.service";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { ZodValidationException } from "nestjs-zod";
import type { Request, Response } from "express";

/**
 * Global exception filter — renders the EXACT same JSON envelope as express
 * error-handler.ts and not-found-handler.ts so clients have a single contract.
 *
 * Envelope shape (all cases):
 *   { success: false, status: "error", errorType, message,
 *     error_code, error_message, stack? (dev only) }
 *
 * Known Mongoose/MongoDB errors (CastError, ValidationError, duplicate key) are
 * mapped to 400/409 first, body-parser errors (too large, malformed JSON) to
 * 413/400; any other non-HTTP error is a generic 500. Zod validation failures
 * render the issue messages joined with ", ", like the express validator.
 * 5xx → logger.error with stack; 4xx → logger.warn. The stack is added to the
 * body only when NODE_ENV is "development" and the status is 5xx (fastify policy).
 * Unmatched routes produce Nest's default NotFoundException (404) which is
 * caught here and rendered with NOT_FOUND errorType — matching not-found-handler.ts.
 */
@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(rawException: unknown, host: ArgumentsHost): void {
    const exception =
      mapDatabaseError(rawException) ?? mapBodyParserError(rawException) ?? rawException;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode: number;
    let message: string;
    let errorType: ErrorType;
    let stack: string | undefined;

    if (exception instanceof AppException) {
      statusCode = exception.getStatus();
      message = exception.message;
      errorType = exception.errorType;
      stack = exception.stack;
    } else if (exception instanceof ZodValidationException) {
      statusCode = exception.getStatus();
      message = zodIssueMessage(exception);
      errorType = "VALIDATION_ERROR";
      stack = exception.stack;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      // Nest wraps messages in { message, statusCode } objects — unwrap to string.
      const resp = exception.getResponse();
      if (isRouterNotFound(exception, req)) {
        // Unmatched route outside the API prefix: Nest's default "Cannot GET /x".
        message = "Resource not found!";
      } else if (typeof resp === "string") {
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
      ...(process.env.NODE_ENV === "development" && statusCode >= 500 && stack ? { stack } : {}),
    });
  }
}

/** Issue messages joined with ", " — same text as the express validation middleware. */
function zodIssueMessage(exception: ZodValidationException): string {
  const issues = (exception.getZodError() as { issues?: { message: string }[] }).issues;
  const joined = Array.isArray(issues) ? issues.map((i) => i.message).join(", ") : "";
  return joined || "Validation failed";
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

/**
 * True only for the 404 Nest's router raises for an unmatched path
 * (`Cannot <METHOD> <url>`), so handler-thrown NotFoundExceptions keep their message.
 */
function isRouterNotFound(exception: HttpException, req: Request): boolean {
  if (exception.getStatus() !== 404 || exception instanceof AppException) return false;
  const text = `Cannot ${req.method} `;
  const message = exception.message;
  return message === `${text}${req.originalUrl}` || message === `${text}${req.url}`;
}
