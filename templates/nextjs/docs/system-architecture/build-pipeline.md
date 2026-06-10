# Build Pipeline

## Commands

| Command          | What it does                                 |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Next.js dev server with Turbopack            |
| `pnpm build`     | Production build (`next build`)              |
| `pnpm start`     | Serve production build (`next start`)        |
| `pnpm typecheck` | `tsc --noEmit` — type-check without emitting |
| `pnpm test`      | `vitest run` — node environment, `@/` alias  |
| `pnpm lint`      | ESLint with flat config (jiti loader)        |
| `pnpm format`    | Prettier write                               |

## Next.js Config

`next.config.ts` is minimal — only enables the React Compiler:

```ts
experimental: {
  reactCompiler: true;
}
```

No custom webpack config. Turbopack handles dev bundling.

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

**Test suite:** 9 test files covering HMAC, headers, Api, Model, TanStack, and
interceptor refresh flows. Integration tests verify interceptor 401→refresh→replay
and auth service behavior.

## TypeScript

- `moduleResolution: "bundler"` — Next.js recommended
- `isolatedModules: true` — required by Next.js transform
- `paths: { "@/*": ["./src/*"] }` — the `@/` alias
- `plugins: [{ name: "next" }]` — enables Next.js LSP features in editors
