# Code Standards

How to write code in this NestJS + TypeScript backend. This is a thin hub — each
topic links to a focused, concrete page under [`code-standards/`](./code-standards/).

## Topics

| Page | Covers |
| --- | --- |
| [file-naming.md](./code-standards/file-naming.md) | kebab-case `.ts`, Nest file roles (`*.module/controller/service`), file-size limit |
| [naming-conventions.md](./code-standards/naming-conventions.md) | variables, functions, types, Zod schemas, schemas, API fields |
| [commit-convention.md](./code-standards/commit-convention.md) | Conventional Commits, header rules, examples |
| [typescript-nestjs.md](./code-standards/typescript-nestjs.md) | strict TS, DI, `AppException`, DTOs via `createZodDto`, guards/decorators, env via config |
| [lint-format.md](./code-standards/lint-format.md) | ESLint flat config + Prettier, import sorting, scripts, Vitest via SWC |

## Core Principles

- **YAGNI / KISS / DRY** — build only what the task needs; no premature
  abstraction; factor out genuine duplication.
- **kebab-case filenames** — every source file is `kebab-case.ts`
  (`security.guard.ts`, `token-revocation.service.ts`, `app-config.service.ts`).
- **≤ ~200 LOC per file** — split early into focused modules / providers.
- **`@/` import alias** — import from source roots via `@/`, never deep relative
  chains. Configured in `tsconfig.json` `paths`, resolved at build by `nest build`
  and in tests by `vite-tsconfig-paths`.
- **DI-first** — services are `@Injectable()` and constructor-injected; never
  `new` a service. Shared providers live in the `@Global` `CommonModule`.
- **Errors via `AppException`** — throw `AppException` with a `statusCode` +
  `errorType`; never `res.status(500)` ad hoc. The global `HttpExceptionFilter`
  shapes the response.
- **No auto-commit** — never run `git commit` / `git push` unless explicitly
  asked. See [commit-convention.md](./code-standards/commit-convention.md).

> Only rules the config or code actually enforces are documented. Where a
> convention is style (not enforced), it is labelled as such.
