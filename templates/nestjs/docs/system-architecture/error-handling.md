# Error Handling

A single error path: throw `AppException`, and one global filter shapes a
consistent JSON envelope. Source:
[`common/exceptions/app.exception.ts`](../../src/common/exceptions/app.exception.ts),
[`common/filters/http-exception.filter.ts`](../../src/common/filters/http-exception.filter.ts),
[`common/pipes/zod-validation.pipe.ts`](../../src/common/pipes/zod-validation.pipe.ts).

## `AppException`

[`app.exception.ts`](../../src/common/exceptions/app.exception.ts) defines the one
error class the codebase throws. It extends Nest's `HttpException` so it
integrates with the framework, while carrying the `errorType` the client expects:

```ts
export class AppException extends HttpException {
  public readonly errorType: ErrorType;
  constructor({ message, statusCode = 500, errorType = "INTERNAL_ERROR" }: AppExceptionParams) {
    super(message, statusCode);
    this.errorType = errorType;
  }
}
```

`ErrorType` is a closed union the client can branch on:

```
VALIDATION_ERROR | AUTHENTICATION_ERROR | AUTHORIZATION_ERROR
| NOT_FOUND | CONFLICT | RATE_LIMIT | INTERNAL_ERROR
```

Services, guards, and the throttler throw `AppException` rather than calling
`res.status(...)` ad hoc. Nest forwards thrown errors (including from `async`
handlers) to the global filter automatically, so handlers can `throw` freely.

## The Global Filter

[`http-exception.filter.ts`](../../src/common/filters/http-exception.filter.ts) is
registered as `APP_FILTER` (in `CommonModule`) with `@Catch()` — it catches
**everything**. It normalizes three cases into one envelope:

| Thrown thing | How it is rendered |
| --- | --- |
| `AppException` | `statusCode` + `message` + its `errorType`, verbatim |
| any other `HttpException` (e.g. Nest's `NotFoundException` for unmatched routes) | status + unwrapped message; `errorType` mapped from status via `mapHttpStatusToErrorType` |
| any non-HTTP error | `500` `INTERNAL_ERROR`, generic message |

```ts
res.status(statusCode).json({
  success: false,
  status: "error",
  errorType,                                  // e.g. 'AUTHENTICATION_ERROR'
  message,
  error_code: statusCode,                     // mirrored under the client's field names
  error_message: message,
  ...(isDev && stack ? { stack } : {}),       // stack only outside production
});
```

- `error_code` / `error_message` mirror the status + message under the field
  names the client error type expects (keeps the contract stable for the
  frontend).
- The stack is included **only** when `NODE_ENV !== "production"`.
- Severity mirrors the status: 5xx → `logger.error` (with stack), 4xx →
  `logger.warn`.

## Not-Found (unmatched routes)

There is no separate not-found handler. An unmatched route produces Nest's
default `NotFoundException` (404), which the global filter catches and renders
with `errorType: "NOT_FOUND"` — the same envelope as every other error.

## Status → ErrorType Mapping

For framework `HttpException`s that lack an `errorType`,
`mapHttpStatusToErrorType` keeps the contract consistent:

| Status | errorType |
| --- | --- |
| 400 | `VALIDATION_ERROR` |
| 401 | `AUTHENTICATION_ERROR` |
| 403 | `AUTHORIZATION_ERROR` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `RATE_LIMIT` |
| ≥ 500 | `INTERNAL_ERROR` |

## Validation Errors

Body validation is the global `ZodValidationPipe` (from `nestjs-zod`, registered
as `APP_PIPE`). DTOs built with `createZodDto(schema)` are validated and
transformed automatically; a failure becomes a `VALIDATION_ERROR` (400) flowing
through the same filter envelope. On success the **parsed** data (with transforms
such as `email.toLowerCase().trim()`) is what the handler receives.

## Example Responses

```jsonc
// 401 — bad credentials
{ "success": false, "status": "error", "errorType": "AUTHENTICATION_ERROR",
  "message": "Invalid email or password!", "error_code": 401,
  "error_message": "Invalid email or password!" }

// 400 — validation
{ "success": false, "status": "error", "errorType": "VALIDATION_ERROR",
  "message": "Password must be at least 8 characters",
  "error_code": 400, "error_message": "Password must be at least 8 characters" }
```

## See Also

- [request-flow.md](./request-flow.md) — where the filter sits in the pipeline
- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — the error types auth throws
