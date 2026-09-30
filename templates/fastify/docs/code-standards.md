# Code Standards

Guidance for the Fastify + TypeScript backend.

## Topics

| Page                                                            | Covers                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| [file-naming.md](./code-standards/file-naming.md)               | file names and feature-module roles                              |
| [naming-conventions.md](./code-standards/naming-conventions.md) | identifiers, schemas, models, and API fields                     |
| [commit-convention.md](./code-standards/commit-convention.md)   | commit header and examples                                       |
| [typescript-node.md](./code-standards/typescript-node.md)       | strict TypeScript, Fastify handlers, Zod schemas, errors, config |
| [lint-format.md](./code-standards/lint-format.md)               | ESLint, Prettier, scripts, and Vitest                            |

## Core principles

- Keep Fastify route schemas and handler behavior aligned.
- Keep controllers thin; put database work and business rules in services.
- Throw AppError for expected failures and let the global handler format them.
- Use the @/ import alias, kebab-case file names, and existing module layout.
- Keep secrets and generated RSA keys out of version control.

See the linked pages for details and runnable commands.
