# Build Pipeline

## Tools

| Tool | Version | Role |
|------|---------|------|
| Vite | 6 | Dev server + bundler |
| `@vitejs/plugin-react` | latest | JSX transform + HMR |
| `@tanstack/router-plugin/vite` | latest | Route codegen (`routeTree.gen.ts`) |
| `@tailwindcss/vite` | 4 | Tailwind CSS v4 via Vite plugin |
| TypeScript | 5 | Type checking (separate from Vite) |
| Vitest | 3 | Unit + integration tests |
| ESLint | 9 flat config | Lint |
| Prettier | 3 | Format |

## Scripts

```
pnpm dev       → vite (HMR, auto-generates routeTree.gen.ts)
pnpm build     → tsc -b && vite build (type check then bundle)
pnpm preview   → vite preview
pnpm typecheck → tsc -b --noEmit
pnpm test      → vitest run
pnpm test:watch→ vitest
pnpm lint      → eslint .
pnpm format    → prettier --write .
```

## Route codegen

`@tanstack/router-plugin/vite` scans `src/routes/` on every dev server start and
build, generating `src/routeTree.gen.ts`. This file is gitignored — it must NOT
be committed. Any CI step that needs the route tree must run `pnpm build` or
`pnpm dev` first.

## TypeScript project references

```
tsconfig.json
  ├── tsconfig.app.json   (src/ — jsx react-jsx, strict, noUncheckedIndexedAccess)
  └── tsconfig.node.json  (config files — no JSX, module: bundler)
```

`tsc -b` builds both references. Vite uses `esbuild` for transpilation (no type
check); TypeScript type checking is a separate step (`pnpm typecheck`).
