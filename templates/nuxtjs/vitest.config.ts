import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// Lightweight vitest config — maps Nuxt's `@`/`~` to the `app/` srcDir. Service
// tests are plain TS and stub the few Nuxt globals they touch, so no full Nuxt
// test environment is needed. The Vue plugin compiles SFCs for page SSR tests.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./app", import.meta.url)),
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./app/__tests__/setup-mock-auth-off.ts"],
    include: ["app/**/*.test.ts"],
  },
});
