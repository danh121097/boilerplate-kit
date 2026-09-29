# Build Pipeline

## Commands

| Command          | What it does                                 |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Next.js dev server with Turbopack            |
| `pnpm build`     | Production build (`next build`)              |
| `pnpm start`     | Serve production build (`next start`)        |
| `pnpm typecheck` | `tsc --noEmit` — type-check without emitting |
| `pnpm test`      | `vitest run` — node environment, `@/` alias  |
| `pnpm lint`      | `eslint . && prettier --check .` (read-only) |
| `pnpm lint:fix`  | `eslint . --fix && prettier --write .`       |
| `pnpm format`    | Prettier write                               |

## Next.js Config

`next.config.ts` is an empty `NextConfig` — no experimental flags and no custom
webpack config. Turbopack handles dev bundling. `next build` also type-checks;
`pnpm typecheck` runs the same check standalone.

## Tailwind v4

Configured via PostCSS (`postcss.config.mjs`):

```js
plugins: { "@tailwindcss/postcss": {} }
```

Design tokens live in `src/app/globals.css` under `@theme inline { ... }`.
No `tailwind.config.js` needed — v4 reads tokens from CSS directly.

## Tests

Vitest runs in `node` environment (no jsdom). This lets tests use `node:crypto`
for HMAC verification. No localStorage mocks needed — tokens are httpOnly cookies
(server-managed). The `@/` alias resolves to `src/` via `vitest.config.ts`.

**Test suite:** Vitest 4, unit tests for core helpers (HMAC, headers, Api, Model,
TanStack, server API/session read, route guard, login schema, session banner,
not-found and users pages) and integration tests for the interceptor
401→refresh→replay flow, the auth service, session flows and mock auth/users.

## TypeScript

- `moduleResolution: "bundler"` — Next.js recommended
- `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` — the shared baseline
- `isolatedModules: true` — required by Next.js transform
- `paths: { "@/*": ["./src/*"] }` — the `@/` alias
- `plugins: [{ name: "next" }]` — enables Next.js LSP features in editors
