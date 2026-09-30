import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

const alias = {
  "@": fileURLToPath(new URL("./app", import.meta.url)),
  "~": fileURLToPath(new URL("./app", import.meta.url)),
};

// Lightweight vitest config — maps Nuxt's `@`/`~` to the `app/` srcDir. Service
// tests are plain TS and stub the few Nuxt globals they touch, so no full Nuxt
// test environment is needed. The Vue plugin compiles SFCs for page SSR tests.
//
// Two projects: `unit` runs as the browser bundle does (`import.meta.server`
// unset), `ssr` runs `*.ssr.test.ts` with `import.meta.server = true`, as the Nuxt
// server bundle does, so server-only branches (e.g. a query's `serverFetcher`) run.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias },
  test: {
    environment: "node",
    setupFiles: ["./app/__tests__/setup-mock-auth-off.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["app/**/*.test.ts"],
          exclude: ["app/**/*.ssr.test.ts"],
        },
      },
      {
        extends: true,
        define: { "import.meta.server": "true" },
        test: { name: "ssr", include: ["app/**/*.ssr.test.ts"] },
      },
    ],
  },
});
