# Request Flow

How an HTTP request travels from the socket to a JSON response in NestJS.
Source: [`src/main.ts`](../../src/main.ts),
[`src/app.module.ts`](../../src/app.module.ts),
[`src/common/guards/security.guard.ts`](../../src/common/guards/security.guard.ts).

## The Pipeline (order is exact)

NestJS runs a fixed sequence around every handler. For this template:

```text
1. Express middleware (main.ts):  helmet → compression → cookieParser
2. Global prefix + CORS:          setGlobalPrefix(apiPrefix), enableCors(credentials)
3. Guards (APP_GUARD):            SecurityGuard  +  AppThrottlerGuard
4. Pipes (APP_PIPE):              ZodValidationPipe   (validates @Body DTOs)
5. Route handler:                 controller method → service
6. Filters (APP_FILTER):          HttpExceptionFilter (on any thrown error)
```

Key points:

- **`enableCors({ credentials: true })`** is required for the httpOnly cookie auth
  to work cross-origin; `origin` comes from the configured CORS origins.
- **`cookieParser()` runs before guards** so `req.cookies.accessToken` /
  `req.cookies.refreshToken` are available to the guard's JWT step and the auth
  controller.
- **Guards run before pipes** — so HMAC, identity, and authorization are settled
  before the body is even validated.

## The Composite SecurityGuard (the load-bearing order)

A single guard ([`security.guard.ts`](../../src/common/guards/security.guard.ts))
runs four steps in a fixed sequence. Using one composite guard guarantees the
order regardless of `APP_GUARD` array position (which NestJS does not order):

```text
1. HMAC integrity   — ALL routes, including @Public and /health
2. Origin / CSRF    — only when config.enableCsrf AND a mutating method (POST/PUT/PATCH/DELETE)
3. JWT identity     — skipped for @Public routes; sets req.user
4. Role check       — only when @Roles metadata is present (needs step 3)
```

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const req = context.switchToHttp().getRequest();
  this.checkHmac(req);                       // 1. always
  this.checkOrigin(req);                      // 2. enableCsrf + mutating only
  const isPublic = this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [...]);
  if (!isPublic) await this.checkJwt(req);    // 3. unless @Public
  const minRole = this.reflector.getAllAndOverride(ROLES_KEY, [...]);
  if (minRole !== undefined) this.checkRole(req.user, minRole); // 4. when @Roles
  return true;
}
```

- **HMAC has no exemption** — even `@Public` and `/health` must send a valid
  `sig`/`ctime`. `@Public()` only skips the JWT step.
- **JWT** extracts the token from `Authorization: Bearer` or the `accessToken`
  cookie, verifies it, runs the user-level revocation check (fail-open when Redis
  is off), and sets `req.user`.
- **Role** compares `ROLE_RANK[user.role]` against the minimum from `@Roles`.

The throttler (`AppThrottlerGuard`) is a separate `APP_GUARD` — order-independent
because it only counts. See
[security-rate-limit.md](./security-rate-limit.md).

## Decorated Routes (no manual registry)

Routes are declared with decorators; Nest's router wires them. There is no
route-registry file:

```ts
@Controller("auth")
export class AuthController {
  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 100, ttl: 60_000 }, login: { limit: 30, ttl: 900_000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) { ... }
}
```

A `@Post('login')` in `@Controller('auth')` under `API_PREFIX=/api/v1` resolves
to `POST /api/v1/auth/login`. Adding a module = import it in `app.module.ts`.

## Controller → Service → Response

The module pattern keeps HTTP concerns and business logic separate:

- **Controller** (`modules/*/*.controller.ts`) — reads validated input + the
  injected `@CurrentUser`, calls the service, shapes the JSON response, sets
  cookies. No DB access.
- **Service** (`modules/*/*.service.ts`) — business logic + injected Mongoose
  models. Throws `AppException` on failure. No request/response objects.

Example — `POST /api/v1/auth/login`:

1. `SecurityGuard` (HMAC → `@Public` skips JWT) → `AppThrottlerGuard` (login
   window) → `ZodValidationPipe` (validates `LoginDto`).
2. `AuthController.login` reads `dto`, calls `AuthService.login`.
3. Service authenticates, signs tokens, persists the hashed refresh token.
4. Controller sets httpOnly cookies (`setTokenCookies`) and returns
   `{ success: true, message, data: { user, tokens } }`.

Errors never reach the controller body — they propagate to `HttpExceptionFilter`.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — the auth flows in detail
- [hmac-verification.md](./hmac-verification.md) — the HMAC step + path derivation
- [error-handling.md](./error-handling.md) — how thrown errors become responses
- [security-rate-limit.md](./security-rate-limit.md) — helmet, CORS, throttlers
