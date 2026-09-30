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
Unmatched routes return 404 with errorType NOT_FOUND. Internal 5xx responses
use a generic message outside development; logs include status and error name
but not request secrets.

## Fastify and validation errors

Route schemas are Zod schemas. fastify-type-provider-zod validates inputs and
serializes declared response shapes. Fastify validation errors become 400
VALIDATION_ERROR with joined issue messages. Malformed JSON is also 400, while
body-limit errors are 413. Mongoose cast, validation, and duplicate-key errors
are mapped by src/utils/map-database-error.ts.

To add a route, keep its Zod schemas in the module's validation.ts and declare
them with Fastify's schema option. Throw AppError from controllers or services
for expected failures; let the global handler shape the response.
