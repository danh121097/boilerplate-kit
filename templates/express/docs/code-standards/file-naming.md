# File Naming

Back to [Code Standards](../code-standards.md).

## kebab-case `.ts`

Every source file uses **kebab-case** with a descriptive name. Long is fine —
the name should explain the file's purpose at a glance.

```
src/middleware/error-handler.ts
src/middleware/not-found-handler.ts
src/utils/route-registrar.ts
src/utils/token-revocation.ts
src/config/environment.ts
```

No `index.ts` barrels except the deliberate aggregation points
(`src/types/index.ts`, `src/routes/index.ts`).

## Module file roles

Each feature lives in `src/modules/<feature>/` and is split into four files by
responsibility. Keep each file doing one job:

| File | Responsibility |
| --- | --- |
| `controller.ts` | HTTP layer: read `req`, call the service, shape `res.json(...)`. No business logic, no DB. |
| `service.ts` | Business logic + data access. Throws `AppError`. Pure of `req`/`res`. |
| `routes.ts` | Declarative `RouteGroup`: method, path, middleware chain, handler. |
| `validation.ts` | Zod schemas + the `validate()` middleware factory for this feature. |

Reference: `src/modules/auth/{controller,service,routes,validation}.ts`. A
smaller feature may omit files it does not need (e.g. `src/modules/user/` has no
`service.ts`/`validation.ts`) — add a file only when there is real content for it
(YAGNI).

## File size

Aim for **≤ ~200 LOC** per file. Split before a file gets large:

- Extract helpers into `src/utils/`.
- Extract shared types into `src/types/`.
- Break a fat service into smaller functions or a second module.

This is a guideline for context-friendliness, not a lint error — but treat 200
lines as the point to stop and refactor.
