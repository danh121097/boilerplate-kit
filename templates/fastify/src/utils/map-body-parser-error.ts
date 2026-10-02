import { AppError } from "@/types";

const UNREADABLE_BODY = "Request body could not be read!";

/**
 * Fixed client-safe answers for request-body failures, keyed by Fastify / @fastify/compress
 * error code. The library's own message can echo request content (a Content-Encoding value,
 * a media type), so it is never forwarded.
 */
const BODY_PARSER_ERRORS = new Map<string, { statusCode: number; message: string }>(
  Object.entries({
    FST_ERR_CTP_INVALID_JSON_BODY: { statusCode: 400, message: "Malformed JSON request body!" },
    FST_ERR_CTP_EMPTY_JSON_BODY: { statusCode: 400, message: "Malformed JSON request body!" },
    FST_ERR_CTP_BODY_TOO_LARGE: { statusCode: 413, message: "Request body is too large!" },
    FST_ERR_CTP_INVALID_MEDIA_TYPE: {
      statusCode: 415,
      message: "Unsupported request content type!",
    },
    FST_CP_ERR_INVALID_CONTENT_ENCODING: {
      statusCode: 415,
      message: "Unsupported request content encoding!",
    },
    FST_ERR_CTP_INVALID_CONTENT_LENGTH: { statusCode: 400, message: UNREADABLE_BODY },
    FST_CP_ERR_INVALID_CONTENT: { statusCode: 400, message: UNREADABLE_BODY },
  }),
);

/**
 * Map body-parser failures to fixed client-safe AppErrors. Any other client-side error
 * from the content-type parser or request decompression gets the generic 400 instead of
 * its raw text. Returns undefined for everything else.
 */
export function mapBodyParserError(err: unknown): AppError | undefined {
  const { code, statusCode } = (err ?? {}) as { code?: unknown; statusCode?: unknown };
  if (typeof code !== "string") return undefined;

  const mapped = BODY_PARSER_ERRORS.get(code);
  if (mapped) return new AppError({ ...mapped, errorType: "VALIDATION_ERROR" });

  const isParserCode = code.startsWith("FST_ERR_CTP_") || code.startsWith("FST_CP_ERR_");
  if (isParserCode && typeof statusCode === "number" && statusCode < 500) {
    return new AppError({
      message: UNREADABLE_BODY,
      statusCode: 400,
      errorType: "VALIDATION_ERROR",
    });
  }
  return undefined;
}

const JSON_MEDIA_TYPE = /^application\/(?:[^;\s]+\+)?json$/i;
const CHARSET_PARAM = /;\s*charset\s*=\s*"?([^";\s]+)"?/i;

/**
 * A JSON body declared in a charset other than UTF-8 is refused with a fixed 415, as the
 * parser would otherwise decode it as UTF-8 regardless. Returns undefined when the
 * content type is not JSON, has no charset, or names utf-8 / utf8 (case-insensitive).
 */
export function unsupportedCharsetError(contentType: string | undefined): AppError | undefined {
  if (!contentType) return undefined;
  const mediaType = contentType.split(";", 1)[0]?.trim() ?? "";
  if (!JSON_MEDIA_TYPE.test(mediaType)) return undefined;
  const charset = CHARSET_PARAM.exec(contentType)?.[1]?.toLowerCase();
  if (charset === undefined || charset === "utf-8" || charset === "utf8") return undefined;
  return new AppError({
    message: "Unsupported request charset!",
    statusCode: 415,
    errorType: "VALIDATION_ERROR",
  });
}
