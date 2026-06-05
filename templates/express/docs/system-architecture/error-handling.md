# Error Handling

A single error path: throw `AppError`, and the global handler shapes one
consistent JSON envelope. Source: [`types/index.ts`](../../src/types/index.ts),
[`middleware/error-handler.ts`](../../src/middleware/error-handler.ts),
[`middleware/not-found-handler.ts`](../../src/middleware/not-found-handler.ts),
[`modules/auth/validation.ts`](../../src/modules/auth/validation.ts).

## `AppError`

[`types/index.ts`](../../src/types/index.ts) defines the one error class the whole
codebase throws:

```ts
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorType: ErrorType;
  constructor({ message, statusCode = 500, errorType = 'INTERNAL_ERROR' }: AppErrorParams) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

`ErrorType` is a closed union the client can branch on:

```
VALIDATION_ERROR | AUTHENTICATION_ERROR | AUTHORIZATION_ERROR
| NOT_FOUND | CONFLICT | RATE_LIMIT | INTERNAL_ERROR
```

Services and middleware throw `AppError` rather than calling `res.status(...)` ad
hoc. Express 5 forwards thrown errors (including from `async` handlers) to the
4-arg error handler automatically, so handlers can `throw` freely.

## The Error Envelope

[`middleware/error-handler.ts`](../../src/middleware/error-handler.ts) is
registered **last** in `app.ts` and emits:

```ts
res.status(statusCode).json({
  success: false,
  status: 'error',
  errorType,                                  // e.g. 'AUTHENTICATION_ERROR'
  message,
  error_code: statusCode,                     // mirrored under the client's field names
  error_message: message,
  ...(config.isDevelopment && { stack: err.stack }),  // stack only in development
});
```

- `statusCode` defaults to `500`, `errorType` to `'INTERNAL_ERROR'` when not set.
- `error_code` / `error_message` mirror the status + message under the field names
  the client error type expects (keeps the contract stable for the frontend).
- The stack is included **only** in `development`.
- Every error is logged: `console.error("[Error] {status}: {message}")`.

## Not-Found Handler

[`middleware/not-found-handler.ts`](../../src/middleware/not-found-handler.ts) is a
catch-all mounted after the routes (before the error handler). It returns the same
envelope shape for unmatched routes:

```ts
res.status(404).json({
  success: false, status: 'error', errorType: 'NOT_FOUND',
  message: 'Resource not found!', error_code: 404, error_message: 'Resource not found!',
});
```

## Validation Errors

Body validation uses Zod via a middleware factory
([`modules/auth/validation.ts`](../../src/modules/auth/validation.ts)):

```ts
export function validate(schema: z.ZodSchema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(', ');
      throw new AppError({ message, statusCode: 400, errorType: 'VALIDATION_ERROR' });
    }
    req.body = result.data;   // replace with parsed/transformed data
    next();
  };
}
```

On success the **parsed** data (with transforms such as `email.toLowerCase().trim()`)
replaces `req.body`. On failure it joins all Zod issue messages into one
`VALIDATION_ERROR` (400) that flows through the same envelope.

`validate(schema)` is wired per-route in the `RouteGroup` middleware chain (e.g.
`validate(loginSchema)` on `/auth/login`).

## Example Responses

```jsonc
// 401 — bad credentials
{ "success": false, "status": "error", "errorType": "AUTHENTICATION_ERROR",
  "message": "Invalid email or password!", "error_code": 401,
  "error_message": "Invalid email or password!" }

// 400 — validation
{ "success": false, "status": "error", "errorType": "VALIDATION_ERROR",
  "message": "Invalid email format, Password must be at least 8 characters",
  "error_code": 400, "error_message": "Invalid email format, Password must be at least 8 characters" }
```

## See Also

- [request-flow.md](./request-flow.md) — where the handlers sit in the pipeline
- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — the error types auth throws
