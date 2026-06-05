import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Lightweight vitest config — only the `@` alias is needed; service tests are
// plain TS and don't require the Vue SFC plugin chain from vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
