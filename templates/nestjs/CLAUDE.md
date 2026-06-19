# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## Project Overview

Node.js + NestJS + TypeScript backend starter — JWT access tokens (RS256) +
httpOnly refresh-token rotation with reuse detection, HMAC-signed request
verification, MongoDB/Mongoose, Socket.IO, named-throttler rate limiting, and a
module / controller / service layout with a single composite `SecurityGuard`,
global `ZodValidationPipe`, and live Swagger docs at `/docs`. Package manager:
**pnpm** (scripts are PM-agnostic).

## Start Here

1. Read [`AGENTS.md`](./AGENTS.md) — the agent reading list + harness entry point.
2. Read [`docs/README.md`](./docs/README.md) — full documentation map.
3. Classify any change through [`docs/FEATURE_INTAKE.md`](./docs/FEATURE_INTAKE.md)
   before editing code.

## Principles

- **YAGNI / KISS / DRY** — no premature abstraction.
- Read the docs before changing code; match existing patterns.
- Handle edge cases and errors; keep public API contracts stable unless intentional.

## Conventions Quick Reference

- **Module pattern**: each feature = a Nest module with `*.controller.ts` +
  `*.service.ts` (+ `dto/*.dto.ts`); register it in `app.module.ts` `imports[]`.
  Routes are decorator-driven (`@Controller`/`@Get`/`@Post`) — no manual registry.
- **Security**: one composite `SecurityGuard` runs HMAC → origin/CSRF → JWT →
  roles. Declare intent per route with `@Public()` / `@Roles('admin')` /
  `@Throttle({ ... })`; never wire guards per route.
- **Validation**: define a Zod schema, wrap it with `createZodDto`, type the
  `@Body()` param — the global `ZodValidationPipe` handles the rest.
- **Errors**: throw `AppException`; the global `HttpExceptionFilter` emits
  `{ success, status, errorType, message, error_code, error_message }`.
- **Filenames**: kebab-case `name.role.ts`. **File size**: aim ≤ ~200 LOC; split
  early. **Imports**: `@/` alias.
- **Secrets**: never commit secrets/keys (`src/keys/*`); HMAC + JWT guard
  protected routes.
- **Commits**: Conventional Commits (`feat`, `fix`, `refactor`, …). Do not auto-commit unless asked.

Full standards: [docs/code-standards.md](./docs/code-standards.md).

## Scripts

```bash
pnpm dev             # nest start --watch
pnpm build           # nest build
pnpm typecheck       # tsc --noEmit -p tsconfig.json
pnpm test            # vitest run
pnpm lint            # eslint "src/**/*.ts"
pnpm format          # prettier --write .
pnpm keys            # generate/rotate the RS256 keypair
pnpm start           # node dist/src/main.js
```

> Scripts are package-manager agnostic — `npm run …`, `yarn …`, or `bun run …`
> work identically.

## Documentation

All docs live in [`./docs/`](./docs/README.md) — **read the map first**. Each
top-level `.md` is a thin index into a matching `docs/<topic>/` folder:

```
docs/
├── README.md                # documentation map (start here)
├── HARNESS.md FEATURE_INTAKE.md ARCHITECTURE.md CONTEXT_RULES.md   # harness front door
├── TEST_MATRIX.md  HARNESS_BACKLOG.md  GLOSSARY.md
├── decisions/  stories/  product/  templates/                     # harness records
├── project-overview-pdr.md  # vision, stack, scripts, constraints
├── codebase-summary.md      # → codebase-summary/* (structure, modules-and-routes, conventions)
├── code-standards.md        # → code-standards/* (file-naming, typescript-nestjs, lint, commits)
├── system-architecture.md   # → system-architecture/* (request-flow, auth-jwt-refresh, hmac-verification, error-handling, database, socket, rate-limit)
└── api-reference.md         # all HTTP endpoints, guards, request/response shapes (live OpenAPI at /docs)
```
