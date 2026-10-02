# Error Handling

Controllers and services throw AppError rather than hand-writing error
responses. src/plugins/error-handlers.ts installs Fastify's setErrorHandler()
and setNotFoundHandler() before route plugins are registered.

## Error envelope

Application, validation, database, and rate-limit failures are normalized to:

```json
{
  "success": false,
  "status": "error",
  "errorType": "VALIDATION_ERROR",
  "message": "Request validation failed!",
  "error_code": 400,
  "error_message": "Request validation failed!"
}
```

The fields preserve the API contract used by the existing backend templates.
Unmatched routes return 404 with errorType NOT_FOUND (under API_PREFIX an unsigned
request gets 401 HMAC_ERROR first). HMAC failures use errorType HMAC_ERROR with
status 401. Internal 5xx responses use a generic message outside development; the
response includes `stack` only when NODE_ENV=development and the status is >= 500.
Logs include status and error name but not request secrets.

## Fastify and validation errors

Route schemas are Zod schemas. fastify-type-provider-zod validates inputs and
serializes declared response shapes. Fastify validation errors become 400
VALIDATION_ERROR with joined issue messages. Malformed JSON is also 400, while
body-limit errors are 413 (messages "Malformed JSON request body!" and "Request
body is too large!"). The remaining content-type parser and request-decompression
failures are mapped by src/utils/map-body-parser-error.ts to fixed messages: 415 for an
unsupported content type, Content-Encoding, or a JSON charset other than utf-8 ("Unsupported
request charset!"), 400 "Request body could not be read!"
for a corrupt compressed body or a Content-Length mismatch. All are VALIDATION_ERROR and
the parser's own text is never forwarded.
The charset rule lives in a `preParsing` hook: it applies to JSON media types
(`application/json`, `+json`) on requests that carry a body (a `Content-Length` or
`Transfer-Encoding` header; a bodyless GET is ignored) and accepts only `utf-8` or
`utf8`, case-insensitive; a missing charset passes. Express and NestJS delegate to
body-parser, which accepts any charset starting with `utf-` (such as `utf-16`) and then fails
to parse the bytes as a 400 "Malformed JSON request body!"; every non-`utf-` charset is the
same 415 on all three. Express and NestJS also parse the body before HMAC, so an unsigned
request with a bad charset is 415 there and 401 HMAC_ERROR here. Mongoose cast, validation, and duplicate-key errors
are mapped by src/utils/map-database-error.ts.

To add a route, keep its Zod schemas in the module's validation.ts and declare
them with Fastify's schema option. Throw AppError from controllers or services
for expected failures; let the global handler shape the response.
