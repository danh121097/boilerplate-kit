# Build Pipeline

How the project compiles, type-checks, and bundles. Driven by **Vite 8** with a
small set of plugins (`vite.config.ts`), `vue-tsc` for type-checking, and the
scripts in `package.json`.

## Vite Config (`vite.config.ts`)

```ts
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    AutoImport({
      imports: ["vue", "vue-router", "@vueuse/core", "vue-i18n", "pinia"],
      dts: "auto-imports.d.ts",
      dirs: ["./src/composables/**", "./src/utils/**"],
      vueTemplate: true,
      eslintrc: { enabled: true, filepath: "./.eslintrc-auto-import.json" },
    }),
    Components({
      dirs: ["./src/components/ui"],   // auto-register UI primitives ONLY
      dts: "components.d.ts",
      directoryAsNamespace: false,
      extensions: ["vue"],
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
```

### Plugins

| Plugin | Purpose |
| --- | --- |
| `@vitejs/plugin-vue` | Compile `.vue` SFCs (`<script setup>`). |
| `@tailwindcss/vite` | Tailwind v4 via its native Vite plugin — no PostCSS config needed. |
| `unplugin-auto-import` | Auto-import APIs from `vue`, `vue-router`, `@vueuse/core`, `vue-i18n`, `pinia`, plus everything under `src/composables/**` and `src/utils/**`. |
| `unplugin-vue-components` | Auto-register components from `src/components/ui` **only**. |

### Auto-Import Scope

`ref`, `computed`, `onMounted`, `useThrottleFn`, `storeToRefs`, etc. are used
without imports (see `useSocketIO.ts`, which never imports `ref`/`onMounted`/
`useThrottleFn`/`storeToRefs`). Generated declaration files keep types and lint
honest:

- `auto-imports.d.ts` — typings for auto-imported APIs.
- `components.d.ts` — typings for auto-registered components.
- `.eslintrc-auto-import.json` — tells ESLint the auto-imported globals exist.

These are generated artifacts; do not hand-edit them.

### Component Registration Boundary

Only `src/components/ui/` is auto-registered, deliberately. Feature components
(e.g. `src/components/<feature>/`) stay **explicit imports** so the global
component registry doesn't grow unbounded. Pinia stores are also always imported
explicitly — they are not in the auto-import `dirs`.

### `@/` Alias

`@` maps to `./src`. Always import via `@/...` (e.g. `@/services/core`,
`@/stores/socket-io`) rather than long relative `../../` paths.

## Type Checking

`vue-tsc` (TypeScript 6) type-checks SFCs and `.ts`. The build runs it before
bundling, so a type error fails the build:

```
build = vue-tsc --noEmit && vite build
```

## Environment Variables

Vite exposes `import.meta.env.VITE_*` to the client. Ones the app reads:

| Var | Used by | Effect |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `init-services.ts` | MAIN backend base URL (falls back to a placeholder API). |
| `VITE_HMAC_SECRET` | `hmac-signature.ts`, `useSocketIO.ts` | Enables HMAC signing when set. |
| `VITE_BUILD_VERSION` | `hmac-signature.ts` | `x-version` header (default `1.0.0`). |
| `VITE_APP_ENDPOINT` | `useSocketIO.ts` | Socket.IO server URL. |
| `VITE_LANGUAGE_CODE` | `i18n.ts` | Default locale fallback. |
| `VITE_APP_NAME` | `storage-keys.ts` | Prefix for localStorage keys. |

## Scripts (`package.json`)

Package manager: **pnpm**.

```bash
pnpm dev          # vite — dev server with HMR
pnpm build        # vue-tsc --noEmit && vite build — type-check then bundle
pnpm preview      # vite preview — serve the production build locally
pnpm typecheck    # vue-tsc --noEmit — types only, no emit
pnpm test         # vitest run
pnpm test:watch   # vitest — watch mode
pnpm lint         # eslint .
pnpm format       # prettier --write .
```
