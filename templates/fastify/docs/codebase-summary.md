# Codebase Summary

A map of this Fastify + TypeScript backend and its module boundaries.

## Topics

| Page                                                                | Covers                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| [directory-structure.md](./codebase-summary/directory-structure.md) | Real source and test tree                                       |
| [modules-and-routes.md](./codebase-summary/modules-and-routes.md)   | Fastify route plugins and feature-module boundaries             |
| [conventions.md](./codebase-summary/conventions.md)                 | Import alias, errors, config, keys, and optional Redis behavior |

## At a glance

- Entry point: src/server.ts connects MongoDB and optional Redis, builds the
  Fastify app, attaches Socket.IO to app.server, and listens.
- HTTP setup: src/app.ts registers Fastify plugins, root security hooks,
  Swagger, rate limits, error handlers, and the API plugin tree.
- Features: health, auth, and user modules under src/modules/.
- Cross-cutting code: src/plugins/, src/config/, src/models/, src/utils/, and
  src/types/.
- Tests: test/ uses Fastify's app.inject() and mongodb-memory-server.

## Read order

1. [directory-structure.md](./codebase-summary/directory-structure.md)
2. [modules-and-routes.md](./codebase-summary/modules-and-routes.md)
3. [conventions.md](./codebase-summary/conventions.md)
