# CLAUDE.md

Guidance for coding agents working in this Fastify backend.

## Project Overview

Node.js + Fastify 5 + TypeScript starter with RS256 access JWTs, HS256
httpOnly refresh-token rotation, HMAC request verification, MongoDB/Mongoose,
Socket.IO, rate limiting, optional Redis, Zod validation, and Swagger.

## Start Here

1. Read [`AGENTS.md`](./AGENTS.md).
2. Read [`docs/README.md`](./docs/README.md), then the relevant architecture/API
   page before changing a contract.

## Principles

- Follow Fastify plugin encapsulation and route registration patterns.
- Keep request validation in route schemas and throw `AppError` for expected
  application errors; the global handler owns the error envelope.
- Keep business logic in services and never return password hashes.
- Never commit local keys, `.env` values, tokens, or credentials.

## Conventions

- Feature modules live under `src/modules/<feature>/` with
  `controller.ts`, `service.ts`, `routes.ts`, and `validation.ts` as needed.
- Register routes as Fastify plugins from `src/routes/index.ts`.
- Use the `@/` import alias and kebab-case file names.
- Keep request/response schemas, Swagger metadata, and handler behavior aligned.

## Commands

```bash
pnpm dev          # tsx watch src/server.ts (generates local RSA keys first)
pnpm build        # tsc --noEmit (build config) && swc src -d dist
pnpm typecheck    # tsc --noEmit -p tsconfig.json
pnpm test         # vitest run
pnpm lint         # eslint src/**/*.ts
pnpm start        # node dist/server.js
```

## Documentation

Project docs live in [`docs/`](./docs/README.md): API reference, code standards,
codebase map, and system architecture. Update them when setup, API behavior, or
architecture changes.
