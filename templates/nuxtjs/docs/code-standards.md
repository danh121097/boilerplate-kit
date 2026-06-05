# Code Standards

How to write code in this Nuxt 4 + TypeScript template so it matches the existing
patterns, passes lint, and stays reviewable. Every rule here is enforced by the
real config (`eslint.config.ts`, `prettier.config.ts`, `tsconfig.json`,
`nuxt.config.ts`) or by the conventions already used across `app/`.

Read the relevant nested doc before writing the matching kind of file.

## Topics

| Topic | What it covers |
| --- | --- |
| [File Naming](./code-standards/file-naming.md) | kebab-case `.ts`, composable filenames, PascalCase `.vue`, `app/` layout, barrels, file size |
| [Naming Conventions](./code-standards/naming-conventions.md) | variables, functions, types, stores, composables, API fields |
| [Commit Convention](./code-standards/commit-convention.md) | Conventional Commits with optional emoji, header rules, examples |
| [Vue + TypeScript](./code-standards/vue-typescript.md) | `<script setup>` section order, `interface Props`/`Emits`, SSR-safe patterns, strict TS |
| [Lint & Format](./code-standards/lint-format.md) | ESLint (`@nuxt/eslint` + perfectionist), Prettier, scripts, generated files |

## Core Principles

- **YAGNI / KISS / DRY** — no premature abstraction; build what the task needs.
- **SSR-first** — code runs on the server and the client. Guard `window` /
  `localStorage` access with an `isClient` check; read secrets via
  `useRuntimeConfig()`, never `import.meta.env`.
- **kebab-case filenames** for `.ts` (composables are the camelCase exception).
- **≤ ~200 LOC per file** — split early into focused modules/components.
- **Barrel imports** — re-export from `index.ts`; import the folder, not deep paths.
- **`@/` alias** — always import from `@/...` (maps to `app/`), never long `../../`.
- **Do not auto-commit** — commit/push only when explicitly asked.
