# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## Project Overview

React 19 + TypeScript SPA starter — Vite, TanStack Router (file-based routes),
TanStack React Query, Zustand, shadcn/ui + Tailwind v4, an axios service layer
with JWT bearer + httpOnly refresh-token rotation + HMAC-signed requests,
react-i18next (en/ja). Package manager: **pnpm**.

## Start Here

1. Read [`AGENTS.md`](./AGENTS.md) — the agent reading list + harness entry point.
2. Read [`docs/README.md`](./docs/README.md) — full documentation map.
3. Classify any change through [`docs/FEATURE_INTAKE.md`](./docs/FEATURE_INTAKE.md)
   before editing code.

## Principles

- **YAGNI / KISS / DRY** — no premature abstraction.
- Read the docs before changing code; match existing patterns.
- Handle edge cases and errors; keep public contracts stable unless intentional.

## Conventions Quick Reference

- **Filenames**: kebab-case for `.ts`; hooks use `useXxx.ts` camelCase.
- **Components**: PascalCase `.tsx` files under `src/components/`.
- **Routes**: file-based under `src/routes/`; `routeTree.gen.ts` is gitignored.
- **Stores**: explicit `import { useXStore } from "@/stores/x"` (no auto-import).
- **File size**: aim ≤ ~200 LOC; split early. **Imports**: barrel `index.ts`, `@/` alias.
- **Commits**: Conventional Commits (`feat`, `fix`, `refactor`, …). Do not auto-commit unless asked.

Full standards: [docs/code-standards.md](./docs/code-standards.md).

## Scripts

```bash
pnpm dev          # Vite dev server (generates routeTree.gen.ts)
pnpm build        # tsc + vite build
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm test:watch   # vitest
pnpm lint         # eslint
pnpm format       # prettier --write
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
├── codebase-summary.md      # → codebase-summary/* (structure, services-and-stores, conventions)
├── code-standards.md        # → code-standards/* (file-naming, react-typescript, lint, commits)
├── system-architecture.md   # → system-architecture/* (bootstrap, networking, security-auth, state, build, errors)
└── design-guidelines.md     # → design-guidelines/* (tailwind, shadcn, theming, a11y)
```
