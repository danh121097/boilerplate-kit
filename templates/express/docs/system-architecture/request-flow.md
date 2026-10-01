# Request Flow

How an HTTP request travels from the socket to a JSON response.
Source: [`src/app.ts`](../../src/app.ts), [`src/routes/index.ts`](../../src/routes/index.ts),
[`src/utils/route-registrar.ts`](../../src/utils/route-registrar.ts).

## Middleware Pipeline (order is exact)

`app.ts` registers middleware in this order — order is load-bearing:

```ts
app.use(helmet());                         // 1. security headers
if (!config.isTest) app.use(morgan(...));  // 2. request logging (skipped in test)
app.use(compression());                    // 3. response compression
app.use(cors({ origin: config.corsOrigins, credentials: true })); // 4. CORS + cookies
app.use(express.json());                   // 5. JSON body parser
app.use(cookieParser());                   // 6. parse cookies (refresh/access cookie)
app.get("/docs/json", ...);                // 7. public OpenAPI document (if docsEnabled)
app.use("/docs", swaggerUi.serve, ...);    // 8. public Swagger UI (if docsEnabled)
app.use(config.apiPrefix, verifyHmacRequest);  // 9. HMAC gate, all API routes
app.use(config.apiPrefix, verifyOrigin);       // 10. CSRF origin guard (no-op unless ENABLE_CSRF=true)
app.use(config.apiPrefix, globalRateLimiter);  // 11. 100/min default limiter
app.use(config.apiPrefix, routes);             // 12. route registry
app.use(notFoundHandler);                  // 13. 404 catch-all (must be after routes)
app.use(errorHandler);                     // 14. error envelope (must be LAST)
```

Key points:

- **`cors(... credentials: true)`** is required for the httpOnly cookie auth to
  work cross-origin; `origin` is the hard-coded `config.corsOrigins` list.
- **`cookieParser()` runs before** HMAC/routes so `req.cookies.refreshToken` /
  `req.cookies.accessToken` are available to the auth controller and middleware.
- **HMAC and the global rate limiter mount on `config.apiPrefix`** (`/api/v1` by
  default) — so they only guard API routes, and `req.url` inside the HMAC
  middleware is already prefix-stripped by the mount (matters for path signing,
  see [hmac-verification.md](./hmac-verification.md)).
- **The JSON body parser runs before HMAC**, so an unsigned request with a
  malformed or oversize body fails as `400`/`413` before it can be rejected as
  `401 HMAC_ERROR` (Fastify checks HMAC first). The body is not signed, so this
  has no security impact.
- **`notFoundHandler` then `errorHandler` are last.** Express 5 forwards thrown
  errors (including from `async` handlers) straight to the 4-arg error handler.

## Declarative Route Registry

Routes are declared as data, not imperative `router.get(...)` calls. Each feature
exports a `RouteGroup` ([`src/types/routing.ts`](../../src/types/routing.ts)):

```ts
const authGroup: RouteGroup = {
  prefix: "/auth",
  routes: [
    {
      method: "post",
      path: "/login",
      bodySchema: loginSchema, // OpenAPI request body schema
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login,
    },
    // ...
  ],
};
```

`src/routes/index.ts` is the single registration point — `groups` is an ordered
array (`health → auth → user`) and each group is mounted under its prefix:

```ts
export const groups: RouteGroup[] = [healthGroup, authGroup, userGroup];
for (const group of groups) router.use(group.prefix, registerGroup(group));
```

`registerGroup` ([`route-registrar.ts`](../../src/utils/route-registrar.ts))
turns the data into an Express `Router`, spreading the per-route middleware chain
before the handler:

```ts
router[method](path, ...middleware, handler);
```

Adding a module = add its group to the `groups` array. Nothing else.

## Controller → Service → Response

The module pattern keeps HTTP concerns and business logic separate:

- **Controller** (`modules/*/controller.ts`) — reads `req`, calls the service,
  shapes the JSON response. No DB access.
- **Service** (`modules/*/service.ts`) — business logic + Mongoose models. Throws
  `AppError` on failure. No `req`/`res`.

Example — `POST /api/v1/auth/login`:

1. `verifyHmacRequest` → `globalRateLimiter` → `loginRateLimiter` → `validate(loginSchema)`.
2. `AuthController.login` reads `{ email, password }`, calls `AuthService.login`.
3. Service authenticates, signs tokens, persists the hashed refresh token.
4. Controller sets httpOnly cookies (`setTokenCookies`) and returns
   `{ success: true, message, data: { user, tokens } }`.

Success responses are plain JSON objects: `{ success: true, message?, data, meta? }`
(auth includes `message`; list endpoints add `meta`). The health route keeps its
own `{ status: "ok", ... }` shape. User records are projected through
`serializeUser` (`modules/user/serialize-user.ts`). Errors never reach the
controller body — they propagate to the global error handler.

## See Also

- [auth-jwt-refresh.md](./auth-jwt-refresh.md) — the auth handlers in detail
- [error-handling.md](./error-handling.md) — how thrown errors become responses
- [security-rate-limit.md](./security-rate-limit.md) — helmet, CORS, limiters
