import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import type { Options as AutoImportOptions } from "unplugin-auto-import/types";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import AutoImport from "unplugin-auto-import/vite";

/**
 * Vite configuration for TanStack Start (SSR mode).
 *
 * Plugin order matters:
 * 1. tailwindcss() — processes Tailwind CSS v4 (must run before JS plugins transform CSS)
 * 2. AutoImport() — injects imports (React hooks, i18n, router runtime hooks, and
 *    src/hooks + src/utils + src/components/ui exports) before the code is transformed
 * 3. tanstackStart() — wires file-based routing, server functions, SSR entrypoints
 * 4. viteReact() — transforms JSX/TSX
 *
 * The @/ alias is defined here so both app code and tsconfig paths align.
 * tsconfig.json carries the matching "paths" entry for TypeScript resolution.
 */
/**
 * Auto-import registry, shared with vitest.config.ts so tests that import route /
 * store modules resolve the same injected globals.
 */
export const autoImportOptions: Pick<AutoImportOptions, "imports" | "dirs"> = {
  imports: [
    "react",
    "react-i18next",
    {
      // Router RUNTIME helpers only. Route-definition APIs (createFileRoute,
      // createRootRoute…) stay explicit — the TanStack Start plugin inserts +
      // maintains those imports itself, and listing them here fights it.
      "@tanstack/react-router": [
        "Link",
        "Outlet",
        "redirect",
        "useNavigate",
        "useRouter",
        "useRouterState",
        "useParams",
        "useSearch",
        "useLoaderData",
      ],
      zustand: ["create"],
    },
  ],
  // Auto-import every export from these folders: custom hooks, utilities (`cn`,
  // cookie helpers), and the UI component library (`<Button>`, `<Card>`… without
  // an import — the React equivalent of unplugin-vue-components).
  dirs: ["./src/hooks", "./src/utils", "./src/components/ui"],
};

export default defineConfig({
  plugins: [
    tailwindcss(),
    AutoImport({
      ...autoImportOptions,
      dts: "auto-imports.d.ts",
      eslintrc: { enabled: true, filepath: "./.eslintrc-auto-import.json" },
    }),
    tanstackStart({
      // Points to the directory containing routes/, router.tsx, etc.
      srcDirectory: "src",
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
