import { autoImportOptions } from "./vite.config";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import AutoImport from "unplugin-auto-import/vite";

export default defineConfig({
  plugins: [AutoImport(autoImportOptions)],
  test: {
    // Run in Node so localStorage stubs and node:crypto work without jsdom overhead.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
