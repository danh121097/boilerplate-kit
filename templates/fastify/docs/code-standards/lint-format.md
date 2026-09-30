# Lint, Format, and Test

Back to [Code Standards](../code-standards.md).

## Tooling

- ESLint flat config checks src TypeScript and import ordering.
- Prettier formats source, tests, configs, and Markdown.
- TypeScript uses tsc --noEmit.
- Vitest runs test/**/*.test.ts.
- Tests call Fastify's app.inject() and use mongodb-memory-server; no external
  MongoDB service is needed.

## Commands

- pnpm lint
- pnpm lint:fix
- pnpm typecheck
- pnpm format:check
- pnpm test
- pnpm test:watch
- pnpm test:coverage

Test coverage is configured in package.json through the Vitest v8 provider.
See vitest.config.ts for global setup, test setup, and timeout behavior.
