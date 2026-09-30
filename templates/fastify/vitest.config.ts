import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["tsconfig.test.json"] })],
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "src/**/*.e2e-spec.ts",
      "test/**/*.test.ts",
      "test/**/*.spec.ts",
      "test/**/*.e2e-spec.ts",
    ],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
