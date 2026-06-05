# Codebase Summary

Where things live and how they fit together in this Express + TypeScript
backend. This is a thin hub — each topic links to a focused page under
[`codebase-summary/`](./codebase-summary/).

## Topics

| Page | Covers |
| --- | --- |
| [directory-structure.md](./codebase-summary/directory-structure.md) | the real `src/` tree with a one-line purpose per file/folder |
| [modules-and-routes.md](./codebase-summary/modules-and-routes.md) | the `controller`/`service`/`routes`/`validation` module pattern and how `RouteGroup` + `route-registrar` wire modules under `API_PREFIX` |
| [conventions.md](./codebase-summary/conventions.md) | `@/` alias, barrels, `AppError`, `RouteGroup` typing, config/env access, RSA keys |

## At A Glance

- **Entry point**: `src/server.ts` connects MongoDB + Redis, then imports
  `src/app.ts` and `src/socket` (deferred so they read the live Redis client).
- **HTTP pipeline**: `app.ts` mounts security/CORS/parsing middleware, then
  HMAC verify → global rate limit → routes, all under `config.apiPrefix`.
- **Routes**: declared as data (`RouteGroup`s) and registered by
  `src/utils/route-registrar.ts`; the registry lives in `src/routes/index.ts`.
- **Features**: `auth` and `user` modules in `src/modules/*`.
- **Cross-cutting**: middleware in `src/middleware/*`, shared logic in
  `src/utils/*`, typed config in `src/config/*`, types in `src/types/*`.
- **Optional tiers**: Redis (rate-limit store, cache, revocation, socket adapter)
  and Socket.IO realtime — both degrade to no-ops/single-instance when off.

## Read Order

1. [directory-structure.md](./codebase-summary/directory-structure.md) — the map.
2. [modules-and-routes.md](./codebase-summary/modules-and-routes.md) — how to add a feature.
3. [conventions.md](./codebase-summary/conventions.md) — the rules to match.
