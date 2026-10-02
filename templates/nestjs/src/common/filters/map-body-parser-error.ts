import { AppException } from "@/common/exceptions/app.exception";
import { HttpException } from "@nestjs/common";

/** body-parser `type` → client-safe status + message (never echo the raw parser message). */
const UNREADABLE = { status: 400, message: "Request body could not be read!" };
const BODY_PARSER_ERRORS: Record<string, { status: number; message: string }> = {
  "entity.too.large": { status: 413, message: "Request body is too large!" },
  "entity.parse.failed": { status: 400, message: "Malformed JSON request body!" },
  "entity.verify.failed": { status: 400, message: "Malformed request body!" },
  "encoding.unsupported": { status: 415, message: "Unsupported request content encoding!" },
  "charset.unsupported": { status: 415, message: "Unsupported request charset!" },
  "request.aborted": UNREADABLE,
  "request.size.invalid": UNREADABLE,
  "stream.encoding.set": UNREADABLE,
  "parameters.too.many": UNREADABLE,
  "stream.not.readable": UNREADABLE,
};

/** Namespaces body-parser/raw-body use for `error.type`; anything unlisted gets a generic reply. */
const BODY_PARSER_TYPE_PATTERN = /^(entity|request|encoding|charset|parameters|stream)\./;

/**
 * Map errors raised by Express body-parser (payload too large, malformed JSON,
 * unsupported encoding/charset, too many parameters, aborted, undecodable compressed
 * body) to a 4xx AppException
 * with a fixed generic message. Returns undefined for any other
 * error so it falls through to the normal handling. body-parser errors are
 * http-errors objects, not Nest HttpExceptions, so they would otherwise render as 500.
 */
export function mapBodyParserError(error: unknown): AppException | undefined {
  if (typeof error !== "object" || error === null || error instanceof HttpException) {
    return undefined;
  }
  const type = (error as { type?: unknown }).type;
  const mapped =
    typeof type === "string"
      ? (BODY_PARSER_ERRORS[type] ?? genericBodyParserError(error, type))
      : untypedBodyError(error);
  if (!mapped) return undefined;
  return new AppException({
    message: mapped.message,
    statusCode: mapped.status,
    errorType: "VALIDATION_ERROR",
  });
}

/**
 * A 4xx error with no `type`: the decompression stream (corrupt gzip/br/deflate body)
 * raises these with the zlib text as the message. Answer with the fixed unreadable-body
 * reply; errors without a 4xx status stay 500.
 */
function untypedBodyError(error: object): { status: number; message: string } | undefined {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const code = typeof status === "number" ? status : statusCode;
  if (typeof code !== "number" || code < 400 || code > 499) return undefined;
  return code === 415 ? { status: 415, message: "Unsupported request body!" } : UNREADABLE;
}

/**
 * A body-parser error type this table does not know: still answer with a fixed
 * message (415 stays 415, other 4xx become 400) instead of echoing parser text.
 */
function genericBodyParserError(
  error: object,
  type: string,
): { status: number; message: string } | undefined {
  if (!BODY_PARSER_TYPE_PATTERN.test(type)) return undefined;
  const status =
    (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  return status === 415 ? { status: 415, message: "Unsupported request body!" } : UNREADABLE;
}
