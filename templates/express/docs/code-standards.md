# Code Standards

How to write code in this Express + TypeScript backend. This is a thin hub —
each topic links to a focused, concrete page under [`code-standards/`](./code-standards/).

## Topics

| Page | Covers |
| --- | --- |
| [file-naming.md](./code-standards/file-naming.md) | kebab-case `.ts`, module file roles, file-size limit |
| [naming-conventions.md](./code-standards/naming-conventions.md) | variables, functions, types, Zod schemas, models, API fields |
| [commit-convention.md](./code-standards/commit-convention.md) | Conventional Commits, header rules, examples |
| [typescript-node.md](./code-standards/typescript-node.md) | strict TS, `AppError`, async handlers, Zod middleware, `RouteGroup`, env via config |
| [lint-format.md](./code-standards/lint-format.md) | ESLint flat config, import sorting, scripts, Vitest |

## Core Principles

- **YAGNI / KISS / DRY** — build only what the task needs; no premature
  abstraction; factor out genuine duplication (see `buildPayload` /
  `createRefreshTokenInDb` in `src/modules/auth/service.ts`).
- **kebab-case filenames** — every source file is `kebab-case.ts`
  (`error-handler.ts`, `route-registrar.ts`, `token-revocation.ts`).
- **≤ ~200 LOC per file** — split early into focused modules. Existing files sit
  well under this (the largest module file, `auth/service.ts`, is ~165 lines).
- **`@/` import alias** — import from source roots via `@/`, never deep relative
  chains (`import { AppError } from "@/types"`). Configured in `tsconfig.json`
  `paths` and resolved at build by `tsc-alias`, in tests by `vite-tsconfig-paths`.
- **Errors via `AppError`** — throw `AppError` with a `statusCode` + `errorType`;
  never `res.status(500)` ad hoc. The global error handler shapes the response.
- **No auto-commit** — never run `git commit` / `git push` unless explicitly
  asked. See [commit-convention.md](./code-standards/commit-convention.md).

> Only rules the config or code actually enforces are documented. Where a
> convention is style (not enforced), it is labelled as such.
