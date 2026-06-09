import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";

/**
 * Vite configuration for TanStack Start (SSR mode).
 *
 * Plugin order matters:
 * 1. tailwindcss() — processes Tailwind CSS v4 (must run before JS plugins transform CSS)
 * 2. tanstackStart() — wires file-based routing, server functions, SSR entrypoints
 * 3. viteReact() — transforms JSX/TSX
 *
 * The @/ alias is defined here so both app code and tsconfig paths align.
 * tsconfig.json carries the matching "paths" entry for TypeScript resolution.
 */
export default defineConfig({
  plugins: [
    tailwindcss(),
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
