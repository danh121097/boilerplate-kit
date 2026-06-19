# Modules & Routes

How a feature is structured and how its routes reach the HTTP server in NestJS.

## The Module Pattern

Each feature is a Nest **module** (`@Module`) that groups a controller, a
service, and its dependencies:

| File | Responsibility |
| --- | --- |
| `dto/*.dto.ts` | Zod schemas wrapped with `createZodDto` — validated by the global `ZodValidationPipe` |
| `*.controller.ts` | HTTP layer: `@Controller` + `@Get`/`@Post` handlers; read params/body/`@CurrentUser`, set cookies, shape the response |
| `*.service.ts` | Business logic + persistence (injected Mongoose models); throws `AppException`; no request/response objects |
| `*.module.ts` | Wires the controller + service and `MongooseModule.forFeature([...])` for the schemas it needs |

`user` has no DTO folder — its endpoints are read-only and take a route param /
query object. Add DTOs only when an endpoint accepts a body.

### Layering rule

`controller` → `service` → `schemas (models)`. Controllers never embed business
rules; services never touch the `Request`/`Response`. Example:
`auth.controller.ts` reads `req.body` (already validated), calls
`authService.register(...)`, then sets httpOnly cookies via `cookie.util.ts`.

## Decorated Routes (no manual registry)

Routes are declared with decorators on controller methods — Nest's
metadata-driven router wires them. There is **no** route-registry file:

```ts
@Controller("auth")
export class AuthController {
  @Public()
  @Throttle({ default: { limit: 100, ttl: 60_000 }, login: { limit: 30, ttl: 900_000 } })
  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.authService.login(dto.email, dto.password);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return { success: true, message: "Login successful!", data: { user, tokens } };
  }

  @Get("me") // no @Public() → JWT required by SecurityGuard
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.userId);
  }
}
```

Route-level metadata read by the global guards:

- `@Public()` — skip the JWT step of `SecurityGuard` (HMAC still applies).
- `@Roles('admin')` — set the minimum role rank (enforced after JWT).
- `@Throttle({ ... })` — pick named throttler windows for this route (always
  include `default` so the global cap is not dropped).
- `@CurrentUser()` — inject `req.user` (the verified `JwtPayload`).

## Wiring: Module → Root → Global Prefix

1. **Feature module** lists its controller(s) and provider(s):

   ```ts
   @Module({
     imports: [MongooseModule.forFeature([
       { name: User.name, schema: UserSchema },
       { name: RefreshToken.name, schema: RefreshTokenSchema },
     ])],
     controllers: [AuthController],
     providers: [AuthService],
   })
   export class AuthModule {}
   ```

2. **Root module** (`app.module.ts`) imports every feature module and registers
   the global guards (`SecurityGuard`, throttler) as `APP_GUARD` providers.

3. **Global prefix** — `main.ts` calls `app.setGlobalPrefix(config.apiPrefix)`,
   so a `@Post('login')` in `@Controller('auth')` under `API_PREFIX=/api/v1`
   resolves to `POST /api/v1/auth/login`.

## Adding a Module

1. `nest g module <name>` (or hand-write `<name>.module.ts`).
2. Add `<name>.controller.ts` (+ `<name>.service.ts`, `dto/` as needed).
3. `MongooseModule.forFeature([...])` for any schema the service injects.
4. Import the module in `app.module.ts` `imports[]` — the only wiring step.

The global `SecurityGuard`, `ZodValidationPipe`, and `HttpExceptionFilter` apply
automatically; no per-route security wiring is needed beyond
`@Public` / `@Roles`.

## Endpoints Today

| Method | Path (under `API_PREFIX`) | Guards / Decorators | Notes |
| --- | --- | --- | --- |
| GET | `/health` | `@Public` (HMAC still enforced) | server + DB + Redis status |
| POST | `/auth/register` | `@Public`, `@Throttle(auth)`, `RegisterDto` | sets token cookies |
| POST | `/auth/login` | `@Public`, `@Throttle(login)`, `LoginDto` | sets token cookies |
| POST | `/auth/refresh` | `@Public`, `@Throttle(auth)`, `RefreshDto` | rotates refresh token (body or cookie) |
| POST | `/auth/logout` | `@Public`, `@Throttle(auth)`, `RefreshDto` | revokes refresh + user access tokens |
| GET | `/auth/me` | JWT (no `@Public`), `@CurrentUser` | current user profile |
| GET | `/users` | JWT + `@Roles('admin')` | list users (offset pagination) |
| GET | `/users/:id` | JWT + `@Roles('admin')` | user by id |

The live, always-accurate version of this table is the Swagger UI at `/docs`.
