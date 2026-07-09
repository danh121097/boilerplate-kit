# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repository.

## Project Overview

Vue 3.5 + TypeScript SPA starter — Vite 8, Pinia, TanStack Vue Query, Reka UI +
Tailwind v4, an axios service layer with JWT bearer + httpOnly refresh-token
rotation + HMAC-signed requests, Socket.IO, and vue-i18n. Package manager: **pnpm**.

## Start Here

1. Read [`AGENTS.md`](./AGENTS.md) — the agent reading list + entry point.
2. Read [`docs/README.md`](./docs/README.md) — full documentation map.

## Principles

- **YAGNI / KISS / DRY** — no premature abstraction.
- Read the docs before changing code; match existing patterns.
- Handle edge cases and errors; keep public contracts stable unless intentional.

## Conventions Quick Reference

- **Filenames**: kebab-case for `.ts`; a composable's filename = its exact `useXxx` name.
- **Components**: PascalCase `.vue`; only `src/components/ui/` is auto-registered.
- **`<script setup>` order**: imports → types → props/emits → composables → const → refs → computed → functions → lifecycle.
- **Props/emits**: extract `interface Props` / `interface Emits` (never inline).
- **Stores**: explicit `import { useXStore } from "@/stores/x"` (no auto-import).
- **File size**: aim ≤ ~200 LOC; split early. **Imports**: barrel `index.ts`, `@/` alias.
- **Commits**: Conventional Commits (`feat`, `fix`, `refactor`, …). Do not auto-commit unless asked.

Full standards: [docs/code-standards.md](./docs/code-standards.md).

## Scripts

```bash
pnpm dev          # Vite dev server
pnpm build        # vue-tsc + vite build
pnpm typecheck    # vue-tsc --noEmit
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
├── project-overview-pdr.md  # vision, stack, scripts, constraints
├── codebase-summary.md      # → codebase-summary/* (structure, services-and-stores, conventions)
├── code-standards.md        # → code-standards/* (file-naming, vue-typescript, lint, commits)
├── system-architecture.md   # → system-architecture/* (bootstrap, networking, security-auth, state, build, errors)
└── design-guidelines.md     # → design-guidelines/* (tailwind, shadcn-vue, theming, a11y)
```
