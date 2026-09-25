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
pnpm typecheck → tsc -b (both project references; noEmit set in each)
pnpm test      → vitest run
pnpm test:watch→ vitest
pnpm lint      → eslint .
pnpm format    → prettier --write .
```

## Route codegen

`@tanstack/router-plugin/vite` scans `src/routes/` on every dev server start and
build, generating `src/routeTree.gen.ts`. The file is committed as a
cold-typecheck stub (together with `auto-imports.d.ts` from unplugin-auto-import)
so `pnpm typecheck` passes on a fresh checkout before the first dev/build. The
plugins regenerate both; re-commit them when routes or the auto-imported surface
change. `.eslintrc-auto-import.json` stays local — the ESLint config reads it
only when present.

## Auto-import and route code splitting

`tanstackRouter({ autoCodeSplitting: true })` moves each route `component` into a
virtual module (`src/routes/login.tsx?tsr-split=component`). unplugin-auto-import's
default `include` (`/\.[jt]sx?$/`) does not match that query suffix, so
`autoImportOptions.include` in `vite.config.ts` adds `/\.[jt]sx\?tsr-split=/` —
without it the split chunks call `useNavigate`/`useState`/`<Button>` with no import
and throw `ReferenceError` at runtime.

## TypeScript project references

```
tsconfig.json
  ├── tsconfig.app.json   (src/ — jsx react-jsx, strict, noUncheckedIndexedAccess)
  └── tsconfig.node.json  (config files — no JSX, module: bundler)
```

`tsc -b` builds both references. Vite uses `esbuild` for transpilation (no type
check); TypeScript type checking is a separate step (`pnpm typecheck`).
