import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import type { Options as AutoImportOptions } from "unplugin-auto-import/types";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import AutoImport from "unplugin-auto-import/vite";

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
      // createRootRoute…) stay explicit — the TanStack Router plugin inserts +
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
  // Auto-import every export from these folders: custom hooks, utilities (`cn`),
  // and the UI component library (`<Button>`, `<Card>`… usable without an import,
  // the React equivalent of unplugin-vue-components).
  dirs: ["./src/hooks", "./src/utils", "./src/components/ui"],
};

export default defineConfig({
  plugins: [
    AutoImport({
      ...autoImportOptions,
      dts: "auto-imports.d.ts",
      eslintrc: { enabled: true, filepath: "./.eslintrc-auto-import.json" },
    }),
    // TanStack Router plugin must come BEFORE the React plugin so it can
    // generate routeTree.gen.ts before TypeScript sees the import in main.tsx.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
