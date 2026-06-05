# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## Project Overview

Node.js + Express + TypeScript backend starter — JWT access tokens + httpOnly
refresh-token rotation, HMAC-signed request verification, MongoDB/Mongoose,
Socket.IO, rate limiting, and a modular `controller/service/routes/validation`
layout. Package manager: **bun**.

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

- **Module pattern**: each feature = `controller.ts` + `service.ts` + `routes.ts` + `validation.ts`; register via `RouteGroup` in `routes/`.
- **Errors**: throw `AppError`; the global error-handler emits `{ success, status, message, error_code, error_message }`.
- **Filenames**: kebab-case. **File size**: aim ≤ ~200 LOC; split early. **Imports**: `@/` alias.
- **Security**: never commit secrets/keys; HMAC + auth middleware guard protected routes.
- **Commits**: Conventional Commits (`feat`, `fix`, `refactor`, …). Do not auto-commit unless asked.

Full standards: [docs/code-standards.md](./docs/code-standards.md).

## Scripts

```bash
bun run dev          # bun --watch src/server.ts
bun run build        # tsc -p tsconfig.build.json && tsc-alias
bun run typecheck    # tsc --noEmit
bun run test         # vitest run
bun run lint         # eslint src/**/*.ts
bun run start        # bun dist/server.js
```

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
├── code-standards.md        # → code-standards/* (file-naming, typescript-node, lint, commits)
├── system-architecture.md   # → system-architecture/* (request-flow, auth-jwt-refresh, hmac-verification, error-handling, database, socket, rate-limit)
└── api-reference.md         # all HTTP endpoints, guards, request/response shapes
```
