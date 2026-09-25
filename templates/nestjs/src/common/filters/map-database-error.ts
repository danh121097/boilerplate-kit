import { AppException } from "@/common/exceptions/app.exception";
import mongoose from "mongoose";

/** MongoDB duplicate-key error code (unique index violation). */
const DUPLICATE_KEY_CODE = 11000;

/**
 * Translate well-known Mongoose/MongoDB errors into client-safe AppExceptions so
 * HttpExceptionFilter never answers them with a 500. Mirrors express
 * utils/map-database-error.ts. Messages name the offending field(s) only — never
 * the submitted value, the collection, or the index. Returns undefined otherwise.
 *
 *   CastError        (malformed ObjectId etc.) → 400 VALIDATION_ERROR
 *   ValidationError  (schema validators)       → 400 VALIDATION_ERROR
 *   code 11000       (unique index violation)  → 409 CONFLICT
 */
export function mapDatabaseError(err: unknown): AppException | undefined {
  if (err instanceof mongoose.Error.CastError) {
    return new AppException({
      message: `Invalid value for ${err.path}!`,
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.keys(err.errors).join(", ");
    return new AppException({
      message: `Invalid value for ${fields}!`,
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }

  if (isDuplicateKeyError(err)) {
    const fields = Object.keys(err.keyPattern ?? {}).join(", ");
    return new AppException({
      message: fields ? `Duplicate value for ${fields}!` : "Resource already exists!",
      statusCode: 409,
      errorType: "CONFLICT",
    });
  }

  return undefined;
}

function isDuplicateKeyError(
  err: unknown,
): err is { code: number; keyPattern?: Record<string, unknown> } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === DUPLICATE_KEY_CODE
  );
}
