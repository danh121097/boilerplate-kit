# File Naming

Back to [Code Standards](../code-standards.md).

## kebab-case `.ts`

Every source file uses **kebab-case** with a descriptive name, following NestJS's
`name.role.ts` convention. Long is fine — the name should explain the file's
purpose at a glance.

```
src/common/guards/security.guard.ts
src/common/filters/http-exception.filter.ts
src/common/token-revocation.service.ts
src/config/app-config.service.ts
src/modules/auth/auth.controller.ts
```

The role suffix (`.module`, `.controller`, `.service`, `.guard`, `.filter`,
`.pipe`, `.decorator`, `.schema`, `.dto`) is part of the name and signals the
file's responsibility.

## Nest file roles

Each feature lives in `src/modules/<feature>/` and splits by responsibility. Keep
each file doing one job:

| File | Responsibility |
| --- | --- |
| `<feature>.module.ts` | `@Module` wiring: controllers, providers, `MongooseModule.forFeature`. |
| `<feature>.controller.ts` | HTTP layer: `@Controller` + route decorators; read input, call the service, shape the response. No business logic, no DB. |
| `<feature>.service.ts` | Business logic + data access (injected models). Throws `AppException`. No request/response. |
| `dto/<name>.dto.ts` | Zod schema + `createZodDto` class for request bodies. |

Reference: `src/modules/auth/{auth.module,auth.controller,auth.service}.ts` plus
`dto/`. A smaller feature may omit files it does not need (e.g.
`src/modules/user/` has no `dto/`) — add a file only when there is real content
for it (YAGNI). Mongoose `@Schema` classes live in `src/schemas/`, shared across
modules.

## File size

Aim for **≤ ~200 LOC** per file. Split before a file gets large:

- Extract helpers into `src/common/*.util.ts` or a dedicated provider.
- Extract shared types into `src/common/types/`.
- Break a fat service into smaller methods or a second provider/module.

This is a guideline for context-friendliness, not a lint error — but treat 200
lines as the point to stop and refactor.
