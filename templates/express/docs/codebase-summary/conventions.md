# Conventions

Codebase-wide patterns to match when adding code. (Style/lint rules live in
[`../code-standards.md`](../code-standards.md); this page is about structural
conventions.)

## `@/` Import Alias

Import from source roots via `@/`, never deep relative chains:

```ts
import { AppError } from '@/types';
import { config } from '@/config/environment';
import { authenticate } from '@/middleware/auth';
```

Declared in `tsconfig.json` (`paths: { "@/*": ["./src/*"] }`). Resolved at build
by `tsc-alias` and in tests by `vite-tsconfig-paths`. The runtime entry
(`bun --watch src/server.ts`) resolves it natively.

## Barrels

There is no global barrel. Two small, deliberate barrels exist:

- `src/types/index.ts` — exports `AppError`, `ErrorType`, `EnvironmentConfig`.
  Import shared errors/types as `from '@/types'`.
- `src/types/auth.ts` — auth-specific types (`ROLES`, `Role`, `JwtPayload`,
  `AuthTokens`, document interfaces). Imported directly as `from '@/types/auth'`.

Modules export a single default `RouteGroup` from `routes.ts` and use
`import * as XController from './controller'` namespace imports for handlers.

## Errors via `AppError`

Never `res.status(500).json(...)` ad hoc in business logic. Throw `AppError`
(`src/types/index.ts`) with a `statusCode` + `errorType`:

```ts
throw new AppError({
  message: 'Email already registered!',
  statusCode: 409,
  errorType: 'CONFLICT',
});
```

`errorType` is a fixed union: `VALIDATION_ERROR | AUTHENTICATION_ERROR |
AUTHORIZATION_ERROR | NOT_FOUND | CONFLICT | RATE_LIMIT | INTERNAL_ERROR`.

The global handler (`src/middleware/error-handler.ts`) catches it and emits one
shape for every error:

```json
{ "success": false, "status": "error", "errorType": "...",
  "message": "...", "error_code": 401, "error_message": "..." }
```

`stack` is included only in development. Express 5 forwards thrown errors from
async handlers automatically — no `try/catch` wrapper needed in controllers.

## Request Validation

Body validation is a middleware factory in each module's `validation.ts`:

```ts
export function validate(schema: z.ZodSchema) { /* safeParse → AppError on fail */ }
```

It throws `AppError({ errorType: 'VALIDATION_ERROR' })` and replaces `req.body`
with the parsed (transformed) data. Wire it per route via `middleware: [validate(loginSchema)]`.

## `RouteGroup` Typing

Routes are typed data, not imperative calls (full detail in
[modules-and-routes.md](./modules-and-routes.md)). `method` is the constrained
`HttpMethod` union so `router[method]` is type-safe with no casts. Always export
the group as `const x: RouteGroup = { ... }` so the compiler checks every route.

## Config & Env Access

Never read `process.env` outside `src/config/environment.ts`. That file calls
`dotenv.config()` once, validates required vars (`getRequiredEnvVar` throws on
missing `MONGODB_URI` / `JWT_REFRESH_SECRET` / `HMAC_SECRET`), and exports a
typed `config: EnvironmentConfig`. Everywhere else:

```ts
import { config } from '@/config/environment';
if (config.isProduction) { /* ... */ }
app.use(config.apiPrefix, routes);
```

Booleans `isProduction` / `isDevelopment` / `isTest` are derived from `NODE_ENV`
— branch on those, not raw strings.

## RSA Keys

Access tokens are RS256-signed with an RSA keypair loaded by
`src/config/keys.ts` → `loadRsaKeyPair()`:

- Reads PEM files from `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`, then runs a
  sign/verify **self-test** so a mismatched pair fails at boot, not at runtime.
- **Fail-closed**: only `test` / `development` may fall back to an ephemeral
  in-memory keypair (per-process, non-persistent). Any other env throws.
- Generate real keys with `src/keys/setup.sh` (the `predev` script does this
  automatically if `rsa.private` is absent). Keep `rsa.private` out of git.

Refresh tokens use HS256 with `JWT_REFRESH_SECRET` (symmetric) — different
algorithm + a `token_use` claim mean a refresh token can never pass access
verification.

## Optional-Tier Pattern

Redis-backed helpers (`cache`, `token-revocation`, the rate-limit store) and the
Socket.IO emit helpers all **degrade gracefully**: `getRedis()` / `getIO()`
return `null` when disabled, and callers no-op or fail open. Follow this pattern
for any new optional-tier code — never branch callers on enabled/disabled.
