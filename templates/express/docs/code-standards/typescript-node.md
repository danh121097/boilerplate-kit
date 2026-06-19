# TypeScript & Node Patterns

Back to [Code Standards](../code-standards.md). Every rule here is grounded in
the actual `src/` code.

## Strict TypeScript

`tsconfig.json` runs `"strict": true` (target ES2022, module CommonJS). That
means no implicit `any`, strict null checks, etc. Consequences:

- Prefer `unknown` over `any` when a precise type is not available — e.g.
  service functions return `{ user: unknown; tokens: AuthTokens }` rather than
  leaking the Mongoose document type.
- Annotate exported function return types (ESLint warns on missing ones via
  `explicit-function-return-type`). Async handlers return `Promise<void>`.
- Imports use the `@/` alias, resolved by `tsc-alias` at build and
  `vite-tsconfig-paths` in tests.

## `AppError` for all failures

Throw a typed `AppError` (`src/types/index.ts`) — never construct ad-hoc error
responses in business code:

```ts
throw new AppError({
  message: 'Email already registered!',
  statusCode: 409,
  errorType: 'CONFLICT'
});
```

`statusCode` defaults to `500` and `errorType` to `'INTERNAL_ERROR'`. The
`errorType` must be one of the `ErrorType` union members.

## Async handlers + error propagation

Express 5 forwards rejected promises from async handlers to the error
middleware automatically — **so handlers and middleware just `throw`; they do
not call `next(err)` or wrap everything in try/catch.**

- Controllers: thin, `async`, `Promise<void>`. Read `req`, call the service,
  write the response. Business errors thrown in the service bubble up:

  ```ts
  export async function login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body;
    const { user, tokens } = await AuthService.login(email, password);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ success: true, message: 'Login successful!', data: { user, tokens } });
  }
  ```

- Use try/catch only to **translate** a low-level error into an `AppError` (as
  `authenticate` does when `jwt.verify` throws), then re-throw. Re-throw an
  existing `AppError` unchanged.

- The global `errorHandler` (`src/middleware/error-handler.ts`) is registered
  **last** and renders the response envelope (and the stack only in
  development). `notFoundHandler` handles unmatched routes.

## Zod validation middleware

Request bodies are validated by a generic `validate(schema)` factory in the
feature's `validation.ts`:

```ts
export function validate(schema: z.ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e) => e.message).join(', ');
      throw new AppError({ message, statusCode: 400, errorType: 'VALIDATION_ERROR' });
    }
    req.body = result.data;   // parsed + transformed value replaces raw body
    next();
  };
}
```

Schemas may `.transform()` (e.g. lowercase + trim email); the handler then reads
the cleaned data off `req.body`. Add `validate(xSchema)` to the route's
middleware chain for any endpoint with a body.

## `RouteGroup` typing

Routes are declared as **data**, not imperative `router.post(...)` calls. A
feature exports a `RouteGroup` (`src/types/routing.ts`); the
`registerGroup` helper (`src/utils/route-registrar.ts`) turns it into a Router:

```ts
const authGroup: RouteGroup = {
  prefix: '/auth',
  routes: [
    {
      method: 'post',
      path: '/login',
      bodySchema: loginSchema,
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login
    }
  ]
};
export default authGroup;
```

`method` is the constrained `HttpMethod` union so `router[method]` matches the
Express overloads with no casting. `bodySchema` is metadata (tooling reads it to
generate examples) — runtime validation is still done by the `validate()`
middleware. Protected routes add `authenticate` (and `requireMinRole(...)` for
role-gated routes) to the middleware chain.

## Environment access via `config`

Never read `process.env` outside `src/config/environment.ts`. Import the typed,
validated `config` object instead:

```ts
import { config } from '@/config/environment';

jwt.verify(token, config.jwtAccessPublicKey, { algorithms: ['RS256'] });
```

`environment.ts` loads `.env`, validates required vars via `getRequiredEnvVar`
(throws on missing `MONGODB_URI`, `HMAC_SECRET`, `JWT_REFRESH_SECRET`, RSA key
paths), applies
defaults for the rest, and exposes everything through the `EnvironmentConfig`
type. Optional features (Redis) are read without `getRequiredEnvVar` so the app
boots when they are off.
