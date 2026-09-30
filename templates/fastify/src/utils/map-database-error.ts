import { AppError } from "@/types";
import mongoose from "mongoose";

/** MongoDB duplicate-key error code (unique index violation). */
const DUPLICATE_KEY_CODE = 11000;

/**
 * Translate well-known Mongoose/MongoDB errors into client-safe AppErrors so the
 * error handler never answers them with a 500 carrying the raw driver message.
 * Messages name the offending field(s) only — never the submitted value, the
 * collection, or the index. Returns undefined for anything else.
 *
 *   CastError        (malformed ObjectId etc.) → 400 VALIDATION_ERROR
 *   ValidationError  (schema validators)       → 400 VALIDATION_ERROR
 *   code 11000       (unique index violation)  → 409 CONFLICT
 */
export function mapDatabaseError(err: unknown): AppError | undefined {
  if (err instanceof mongoose.Error.CastError) {
    return new AppError({
      message: `Invalid value for ${err.path}!`,
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.keys(err.errors).join(", ");
    return new AppError({
      message: `Invalid value for ${fields}!`,
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }

  if (isDuplicateKeyError(err)) {
    const fields = Object.keys(err.keyPattern ?? {}).join(", ");
    return new AppError({
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
