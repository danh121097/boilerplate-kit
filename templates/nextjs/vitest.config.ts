import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run in Node so localStorage stubs and node:crypto work without jsdom overhead.
    environment: "node",
    setupFiles: ["./src/__tests__/setup-mock-auth-off.ts"],
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
