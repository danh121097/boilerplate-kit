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
| srvx | 0.11 | Node production server for the built fetch handler (`pnpm start`). A runtime `dependency`, not a devDependency: the `start` CLI and `dist/server/server.js` both import it, so `pnpm install --prod && pnpm start` needs it |
| ESLint | 9 flat config | Lint |
| Prettier | 3 | Format |

## Scripts

```
pnpm dev       → vite (HMR, auto-generates routeTree.gen.ts)
pnpm build     → tsc --noEmit && vite build (type check then SSR bundle)
pnpm start     → srvx --prod --static ../client dist/server/server.js (Node server of the built
                 fetch handler; static assets from dist/client — the path is relative to the entry.
                 PORT, default 3000; srvx also loads .env from the working directory)
pnpm typecheck → tsc --noEmit
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

TanStack Start's router plugin code-splits by default, moving each route
`component` into a virtual module (`src/routes/login.tsx?tsr-split=component`). unplugin-auto-import's
default `include` (`/\.[jt]sx?$/`) does not match that query suffix, so
`autoImportOptions.include` in `vite.config.ts` adds `/\.[jt]sx\?tsr-split=/` —
without it the split chunks call `useNavigate`/`useState`/`<Button>` with no import
and throw `ReferenceError` at runtime.

## TypeScript config

A single `tsconfig.json` covers `src/` and the config files. Vite uses `esbuild`
for transpilation (no type check); `pnpm build` runs `pnpm typecheck`'s
`tsc --noEmit` first so a type error fails the build.
