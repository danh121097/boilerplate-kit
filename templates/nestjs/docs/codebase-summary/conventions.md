# Conventions

Codebase-wide patterns to match when adding code. (Style/lint rules live in
[`../code-standards.md`](../code-standards.md); this page is about structural
conventions.)

## `@/` Import Alias

Import from source roots via `@/`, never deep relative chains:

```ts
import { AppException } from "@/common/exceptions/app.exception";
import { AppConfigService } from "@/config/app-config.service";
```

Declared in `tsconfig.json` (`paths: { "@/*": ["src/*"] }`). Resolved by
`nest build` / `ts-node` at runtime and by `vite-tsconfig-paths` in tests.
(Some existing files use relative imports for short hops — both work; prefer `@/`
for cross-area imports.)

## Dependency Injection

NestJS is DI-first. Services are `@Injectable()` and constructor-injected; never
`new` a service. Shared providers live in the `@Global` `CommonModule`
(`TokenService`, `HmacService`, `PasswordService`, `TokenRevocationService`,
`CacheService`, the global pipe/filter) and resolve everywhere without re-import.
A feature module only declares its own controller + service and the schemas it
injects via `MongooseModule.forFeature([...])`.

> DI relies on emitted decorator metadata. `tsconfig.json` sets
> `emitDecoratorMetadata` + `experimentalDecorators`; tests transpile with
> `unplugin-swc` (not esbuild) so that metadata survives — see
> [../code-standards/lint-format.md](../code-standards/lint-format.md).

## Errors via `AppException`

Never `res.status(500).json(...)` ad hoc in business logic. Throw `AppException`
(`src/common/exceptions/app.exception.ts`, extends Nest's `HttpException`) with a
`statusCode` + `errorType`:

```ts
throw new AppException({
  message: "Email already registered!",
  statusCode: 409,
  errorType: "CONFLICT",
});
```

`errorType` is a fixed union: `VALIDATION_ERROR | AUTHENTICATION_ERROR |
AUTHORIZATION_ERROR | NOT_FOUND | CONFLICT | RATE_LIMIT | INTERNAL_ERROR`.

The global `HttpExceptionFilter` (registered as `APP_FILTER`) catches it — and
any other thrown error — and emits one shape:

```json
{ "success": false, "status": "error", "errorType": "...",
  "message": "...", "error_code": 409, "error_message": "..." }
```

`stack` is included only in development. Throwing inside an async handler is
forwarded to the filter automatically — no `try/catch` wrapper needed unless you
are translating a low-level error.

## Request Validation via DTOs

Body validation is declarative. Define a Zod schema, wrap it with `createZodDto`
(`nestjs-zod`), and type the handler parameter — the global `ZodValidationPipe`
validates and transforms it:

```ts
// dto/login.dto.ts
export const loginSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(1),
});
export class LoginDto extends createZodDto(loginSchema) {}

// controller
async login(@Body() dto: LoginDto) { /* dto is validated + transformed */ }
```

A failure becomes a `VALIDATION_ERROR` (400) in the standard envelope. The same
schema feeds the Swagger/OpenAPI document at `/docs`.

## Route Metadata Decorators

Security is declared per-route, not wired per-route:

- `@Public()` — skip the JWT step of `SecurityGuard` (HMAC still applies).
- `@Roles('admin')` — minimum role rank, enforced after JWT.
- `@Throttle({ default: {...}, auth: {...} })` — pick named throttler windows;
  always include `default` so the global cap is not dropped.
- `@CurrentUser()` — inject the verified `JwtPayload` (`req.user`).

## Config & Env Access

Never read `process.env` outside the config layer. The Zod env schema
(`src/config/env.schema.ts`) validates required vars at boot; `AppConfigService`
exposes typed getters:

```ts
constructor(private readonly config: AppConfigService) {}
// ...
if (this.config.isProduction) { /* ... */ }
this.config.apiPrefix;        // "/api/v1"
this.config.corsOrigins;      // string[]
```

Booleans `isProduction` / `isDevelopment` / `isTest` are derived from `NODE_ENV`
— branch on those, not raw strings.

## RSA Keys

Access tokens are RS256-signed with an RSA keypair loaded by `src/config/keys.ts`
and self-tested when `AppConfigService` is constructed:

- Reads PEM files from `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH`, then runs a
  sign/verify **self-test** so a mismatched pair fails at boot, not at runtime.
- Generate real keys with `pnpm keys` (portable Node script, runs automatically
  via `predev`) or `src/keys/setup.sh` (openssl). Keep `rsa.private` out of git.

**Refresh** tokens are signed with **HS256** using the symmetric secret
`JWT_REFRESH_SECRET` (≥32 chars, required). A symmetric secret is correct here
because refresh tokens are only ever verified by this auth server, never handed to
a third party. The `token_use` claim ("access" vs "refresh") means a refresh
token can never pass access verification.

## Optional-Tier Pattern

Redis-backed helpers (`CacheService`, `TokenRevocationService`, the throttler
storage) and the Socket.IO emit helpers all **degrade gracefully**:
`RedisService.getClient()` returns `null` when disabled, and callers no-op or
fail open. Follow this pattern for any new optional-tier code — never branch
callers on enabled/disabled or let a Redis outage 500 a route.
