import { AppException } from "@/common/exceptions/app.exception";

/** body-parser `type` → client-safe status + message (never echo the raw parser message). */
const BODY_PARSER_ERRORS: Record<string, { status: number; message: string }> = {
  "entity.too.large": { status: 413, message: "Request body too large!" },
  "entity.parse.failed": { status: 400, message: "Malformed request body!" },
  "entity.verify.failed": { status: 400, message: "Malformed request body!" },
  "request.aborted": { status: 400, message: "Request aborted!" },
  "request.size.invalid": { status: 400, message: "Invalid request size!" },
  "encoding.unsupported": { status: 415, message: "Unsupported content encoding!" },
  "charset.unsupported": { status: 415, message: "Unsupported charset!" },
};

/**
 * Map errors raised by Express body-parser (payload too large, malformed JSON,
 * unsupported encoding) to a 4xx AppException. Returns undefined for any other
 * error so it falls through to the normal handling. body-parser errors are
 * http-errors objects, not Nest HttpExceptions, so they would otherwise render as 500.
 */
export function mapBodyParserError(error: unknown): AppException | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const type = (error as { type?: unknown }).type;
  const mapped = typeof type === "string" ? BODY_PARSER_ERRORS[type] : undefined;
  if (!mapped) return undefined;
  return new AppException({
    message: mapped.message,
    statusCode: mapped.status,
    errorType: "VALIDATION_ERROR",
  });
}
