import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Lightweight vitest config — maps Nuxt's `@`/`~` to the `app/` srcDir. Service
// tests are plain TS and stub the few Nuxt globals they touch, so no full Nuxt
// test environment is needed.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app", import.meta.url)),
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
