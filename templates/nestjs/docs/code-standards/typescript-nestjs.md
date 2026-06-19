# TypeScript & NestJS Patterns

Back to [Code Standards](../code-standards.md). Every rule here is grounded in
the actual `src/` code.

## Strict TypeScript

`tsconfig.json` runs `"strict": true` (target ES2022, module CommonJS) with
`experimentalDecorators` + `emitDecoratorMetadata` on (NestJS DI depends on the
emitted metadata). Consequences:

- Prefer `unknown` over `any` when a precise type is not available — e.g. service
  methods return `{ user: unknown; tokens: AuthTokens }` rather than leaking the
  Mongoose document type.
- Annotate exported function / method return types (ESLint warns on missing ones
  via `explicit-function-return-type`).
- Imports use the `@/` alias, resolved by `nest build` and by
  `vite-tsconfig-paths` in tests.

## Dependency Injection

Providers are `@Injectable()` and constructor-injected — never `new`ed:

```ts
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly tokenService: TokenService,
    private readonly passwordService: PasswordService,
  ) {}
}
```

Shared providers live in the `@Global` `CommonModule` and resolve anywhere
without re-import. A feature module declares only its own controller/service and
the schemas it injects (`MongooseModule.forFeature([...])`).

## `AppException` for all failures

Throw a typed `AppException` (`src/common/exceptions/app.exception.ts`, extends
Nest's `HttpException`) — never construct ad-hoc error responses in business code:

```ts
throw new AppException({
  message: "Email already registered!",
  statusCode: 409,
  errorType: "CONFLICT",
});
```

`statusCode` defaults to `500` and `errorType` to `"INTERNAL_ERROR"`. The
`errorType` must be one of the `ErrorType` union members. The global
`HttpExceptionFilter` (registered as `APP_FILTER`) catches it — and any other
thrown error — and renders the standard envelope. Async handlers can `throw`
freely; use `try/catch` only to **translate** a low-level error (as the guard's
JWT step does around `verifyAccessToken`) and then re-throw.

## DTO validation via `createZodDto`

Request bodies are validated declaratively. Define a Zod schema, wrap it with
`createZodDto` (`nestjs-zod`), and type the handler parameter — the global
`ZodValidationPipe` validates and transforms it before the handler runs:

```ts
// dto/register.dto.ts
export const registerSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).trim(),
});
export class RegisterDto extends createZodDto(registerSchema) {}

// auth.controller.ts
async register(@Body() dto: RegisterDto) { /* dto is validated + transformed */ }
```

Schemas may `.transform()` (e.g. lowercase + trim email); the handler reads the
cleaned data off the DTO. A failure becomes a `VALIDATION_ERROR` (400) in the
standard envelope. The same schema feeds the Swagger document at `/docs`.

## Guards & route metadata

Security is one composite global guard, not per-route middleware. Declare intent
with decorators; `SecurityGuard` reads the metadata:

```ts
@Public()                     // skip JWT step (HMAC still enforced)
@Roles("admin")               // minimum role rank (enforced after JWT)
@Throttle({ default: { limit: 100, ttl: 60_000 }, auth: { limit: 30, ttl: 900_000 } })
@CurrentUser()                // inject the verified JwtPayload
```

`SecurityGuard` runs a fixed order — HMAC → origin/CSRF → JWT → role — so a new
protected route needs no security wiring beyond `@Public` / `@Roles`. See
[../system-architecture/request-flow.md](../system-architecture/request-flow.md).

## Environment access via `AppConfigService`

Never read `process.env` outside the config layer. The Zod env schema
(`src/config/env.schema.ts`) validates required vars at boot; inject the typed
`AppConfigService`:

```ts
constructor(private readonly config: AppConfigService) {}
// ...
this.tokenService.verifyAccessToken(token);   // TokenService reads config.jwtAccessPublicKey
if (this.config.isProduction) { /* ... */ }
```

The schema throws on missing `MONGODB_URI`, `HMAC_SECRET` (min 32 chars),
`JWT_REFRESH_SECRET` (min 32 chars), and the RSA key paths; optional features
(Redis) default off so the app boots without them.
