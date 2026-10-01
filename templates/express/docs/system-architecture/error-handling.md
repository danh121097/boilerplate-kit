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
  constructor({ message, statusCode = 500, errorType = "INTERNAL_ERROR" }: AppErrorParams) {
    super(message);
    this.statusCode = statusCode;
    this.errorType = errorType;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
```

`ErrorType` is a closed union the client can branch on:

```
VALIDATION_ERROR | AUTHENTICATION_ERROR | AUTHORIZATION_ERROR | HMAC_ERROR
| NOT_FOUND | CONFLICT | RATE_LIMIT | INTERNAL_ERROR
```

`HMAC_ERROR` (status `401`) is thrown by the HMAC gate only, so a client can tell a
bad signature or clock skew from an invalid session.

Services and middleware throw `AppError` rather than calling `res.status(...)` ad
hoc. Express 5 forwards thrown errors (including from `async` handlers) to the
4-arg error handler automatically, so handlers can `throw` freely.

## The Error Envelope

[`middleware/error-handler.ts`](../../src/middleware/error-handler.ts) is
registered **last** in `app.ts` and emits:

```ts
res.status(statusCode).json({
  success: false,
  status: "error",
  errorType, // e.g. 'AUTHENTICATION_ERROR'
  message,
  error_code: statusCode, // mirrored under the client's field names
  error_message: message,
  ...(config.isDevelopment && statusCode >= 500 && { stack: err.stack }), // dev + 5xx only
});
```

- `statusCode` defaults to `500`, `errorType` to `'INTERNAL_ERROR'` when not set.
- Mongoose `CastError` / `ValidationError` → `400 VALIDATION_ERROR` and MongoDB
  duplicate key (`code 11000`) → `409 CONFLICT`, naming the field(s) only
  ([`utils/map-database-error.ts`](../../src/utils/map-database-error.ts)).
- Any other non-`AppError` that ends as a 5xx answers `"Internal Server Error!"`;
  its raw message is only logged.
- `error_code` / `error_message` mirror the status + message under the field names
  the client error type expects (keeps the contract stable for the frontend).
- The stack is included **only** when `NODE_ENV=development` **and** the status is
  `>= 500`; 4xx never carry one.
- Body-parser failures (`express.json()` runs before HMAC) are mapped to fixed
  client-safe messages, never the parser's own text: invalid JSON →
  `400 VALIDATION_ERROR` "Malformed JSON request body!", oversize →
  `413 VALIDATION_ERROR` "Request body is too large!". So an unsigned request with
  a bad body gets `400`/`413` here, where Fastify answers `401` (HMAC first); HMAC
  does not cover the body, so the order has no security impact.
- Every error is logged through the app `logger`: `error` level (with the
  stack) for 5xx, `warn` for 4xx.

## Not-Found Handler

[`middleware/not-found-handler.ts`](../../src/middleware/not-found-handler.ts) is a
catch-all mounted after the routes (before the error handler). It returns the same
envelope shape for unmatched routes. Under `apiPrefix` an unsigned request never
gets this far (`401 HMAC_ERROR` first); a signed one reaches it and counts against
the global limiter:

```ts
res.status(404).json({
  success: false,
  status: "error",
  errorType: "NOT_FOUND",
  message: "Resource not found!",
  error_code: 404,
  error_message: "Resource not found!",
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
      const message = result.error.issues.map((e) => e.message).join(", ");
      throw new AppError({ message, statusCode: 400, errorType: "VALIDATION_ERROR" });
    }
    req.body = result.data; // replace with parsed/transformed data
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
