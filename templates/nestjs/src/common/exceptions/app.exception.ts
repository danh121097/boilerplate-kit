import { HttpException } from "@nestjs/common";

/**
 * Error types mirror express types/index.ts ErrorType union exactly.
 * Frontend code branches on these strings — do not rename them.
 */
export type ErrorType =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "INTERNAL_ERROR";

interface AppExceptionParams {
  message: string;
  statusCode?: number;
  errorType?: ErrorType;
}

/**
 * NestJS equivalent of express AppError. Extends HttpException so Nest's
 * exception pipeline handles it, while carrying the typed errorType the
 * HttpExceptionFilter needs to render the exact express error envelope.
 */
export class AppException extends HttpException {
  public readonly errorType: ErrorType;

  constructor({
    message,
    statusCode = 500,
    errorType = "INTERNAL_ERROR",
  }: AppExceptionParams) {
    super(message, statusCode);
    this.errorType = errorType;
    Object.setPrototypeOf(this, AppException.prototype);
  }
}
