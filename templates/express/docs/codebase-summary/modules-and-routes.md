# Modules & Routes

How a feature is structured and how its routes reach the HTTP server.

## The Module Pattern

Each feature module under `src/modules/<name>/` splits into up to four files by
responsibility:

| File | Responsibility |
| --- | --- |
| `validation.ts` | Zod schemas + the `validate()` middleware factory |
| `routes.ts` | A declarative `RouteGroup`: path, method, middleware, handler |
| `controller.ts` | HTTP layer: read `req`, call the service, set cookies, shape `res` |
| `service.ts` | Business logic + persistence; throws `AppError`, no `req`/`res` |

`user` has no `service.ts` or `validation.ts` — read-only endpoints query the
model directly in the controller. Add those files only when the logic grows.

### Layering rule

`routes` → `controller` → `service` → `models`. Controllers never embed business
rules; services never touch `req`/`res`. Example: `auth/controller.ts` reads
`req.body`, calls `AuthService.register(...)`, then `setTokenCookies(res, ...)`.

## Declarative Routes via `RouteGroup`

Routes are data, not imperative `router.get(...)` calls. The shape
(`src/types/routing.ts`):

```ts
interface RouteConfig {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;            // relative to the group prefix, e.g. '/login', '/:id'
  middleware?: RequestHandler[];
  handler: RequestHandler;
  bodySchema?: ZodType;    // tooling-only hint (Postman generator); not enforced
}
interface RouteGroup { prefix: string; routes: RouteConfig[]; }
```

A module exports one `RouteGroup` (`src/modules/auth/routes.ts`):

```ts
const authGroup: RouteGroup = {
  prefix: '/auth',
  routes: [
    { method: 'post', path: '/login', bodySchema: loginSchema,
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login },
    { method: 'get', path: '/me',
      middleware: [authenticate], handler: AuthController.getMe },
    // ...
  ],
};
export default authGroup;
```

## Wiring: Registry → Registrar → Mount

1. **Registry** — `src/routes/index.ts` collects every group in order:

   ```ts
   export const groups: RouteGroup[] = [healthGroup, authGroup, userGroup];
   for (const group of groups) router.use(group.prefix, registerGroup(group));
   ```

   Order is preserved (health → auth → user) to keep route precedence stable.
   The exported `groups` array is reused by tooling (the Postman generator).

2. **Registrar** — `src/utils/route-registrar.ts` turns a group into a Router.
   `method` is a constrained union, so `router[method]` matches Express overloads
   with no `any` cast:

   ```ts
   export function registerGroup({ routes }: RouteGroup): Router {
     const router = Router();
     for (const { method, path, middleware = [], handler } of routes)
       router[method](path, ...middleware, handler);
     return router;
   }
   ```

3. **Mount** — `src/app.ts` mounts the whole registry under `config.apiPrefix`,
   *after* HMAC verification and the global rate limiter:

   ```ts
   app.use(config.apiPrefix, verifyHmacRequest);
   app.use(config.apiPrefix, globalRateLimiter);
   app.use(config.apiPrefix, routes);          // from src/routes
   app.use(notFoundHandler);                    // 404, then errorHandler last
   ```

So `POST /login` in `authGroup` (prefix `/auth`) under `API_PREFIX=/api/v1`
resolves to `POST /api/v1/auth/login`.

## Adding a Module

1. Create `src/modules/<name>/{validation,service,controller,routes}.ts`
   (drop validation/service if the feature doesn't need them).
2. Export a single `RouteGroup` from `routes.ts`.
3. Register it in `src/routes/index.ts` `groups[]` (the only wiring step).

## Endpoints Today

| Method | Path (under `API_PREFIX`) | Middleware | Notes |
| --- | --- | --- | --- |
| GET | `/health` | — | server + DB + Redis status |
| POST | `/auth/register` | authRateLimiter, validate | sets token cookies |
| POST | `/auth/login` | loginRateLimiter, validate | sets token cookies |
| POST | `/auth/refresh` | authRateLimiter | rotates refresh token (reads cookie) |
| POST | `/auth/logout` | authRateLimiter | revokes refresh + user access tokens |
| GET | `/auth/me` | authenticate | current user profile |
| GET | `/users` | authenticate, requireMinRole('admin') | list users |
| GET | `/users/:id` | authenticate | user by id |
