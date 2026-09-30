# File Naming

Source modules use descriptive kebab-case TypeScript names.

## Feature module roles

Features live under src/modules/<feature>/ and may use:

| File          | Responsibility                                                  |
| ------------- | --------------------------------------------------------------- |
| controller.ts | HTTP boundary: read FastifyRequest, call services, send replies |
| service.ts    | business logic and data access                                  |
| routes.ts     | Fastify plugin, route schemas, guards, and handlers             |
| validation.ts | Zod schemas and inferred types                                  |

Keep a file only when it has a real responsibility. The health module only has
routes.ts; auth and user have the files required by their behavior.

## Other naming rules

- Use index.ts only for real aggregation points, such as src/routes/index.ts
  and src/types/index.ts.
- Put shared request/auth types in src/types/.
- Aim for roughly 200 lines per file; split along clear responsibilities when
  a module grows past that size.
