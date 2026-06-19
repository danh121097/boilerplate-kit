# Codebase Summary

Where things live and how they fit together in this NestJS + TypeScript backend.
This is a thin hub — each topic links to a focused page under
[`codebase-summary/`](./codebase-summary/).

## Topics

| Page | Covers |
| --- | --- |
| [directory-structure.md](./codebase-summary/directory-structure.md) | the real `src/` tree with a one-line purpose per file/folder |
| [modules-and-routes.md](./codebase-summary/modules-and-routes.md) | the Nest module / controller / service pattern and how decorated routes wire under the global `API_PREFIX` |
| [conventions.md](./codebase-summary/conventions.md) | `@/` alias, DI, `AppException`, DTOs via `createZodDto`, config/env access, RSA keys, optional-tier pattern |

## At A Glance

- **Entry point**: `src/main.ts` creates the Nest app, applies helmet /
  compression / cookie-parser, sets the global prefix, enables CORS, mounts
  Swagger at `/docs`, installs the `RedisIoAdapter` when Redis is on, and listens.
- **Root module**: `src/app.module.ts` wires every feature module and registers
  the composite `SecurityGuard` (and the throttler guard) as global `APP_GUARD`s.
- **Request guarding**: one composite `SecurityGuard` runs HMAC → origin/CSRF →
  JWT → role in a fixed order; validation is a global `ZodValidationPipe`; errors
  flow through a global `HttpExceptionFilter`.
- **Features**: `auth` and `user` modules in `src/modules/*`; `health` and
  `realtime` as their own modules.
- **Cross-cutting**: shared providers in `src/common/*` (`@Global` `CommonModule`),
  typed config in `src/config/*`, schemas in `src/schemas/*`, Redis in `src/redis/*`.
- **Optional tiers**: Redis (throttler store, cache, revocation, socket adapter)
  and Socket.IO realtime — both degrade to no-ops / single-instance when off.

## Read Order

1. [directory-structure.md](./codebase-summary/directory-structure.md) — the map.
2. [modules-and-routes.md](./codebase-summary/modules-and-routes.md) — how to add a feature.
3. [conventions.md](./codebase-summary/conventions.md) — the rules to match.
