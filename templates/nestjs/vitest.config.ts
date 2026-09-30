import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// NestJS relies on `emitDecoratorMetadata` for constructor-based DI. Vitest's
// default esbuild transform drops that metadata, so providers fail to resolve at
// runtime. `unplugin-swc` re-emits decorator metadata; `vite-tsconfig-paths`
// honours the `@/*` alias. Keep both — removing either breaks DI in tests.
export default defineConfig({
  test: {
    globals: true,
    root: "./",
    // globalSetup runs ONCE in the main process before any worker starts —
    // starts MongoMemoryServer and provides its URI to workers (`provide`/`inject`,
    // per run — concurrent runs never share a database).
    globalSetup: ["./test/global-setup.ts"],
    // setupFiles run in each worker before any test file — injects the provided
    // URI, sets all process.env vars, and registers mongoose lifecycle hooks.
    // Vars must be set here (not globalSetup) because workers have isolated env.
    setupFiles: ["./test/setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "src/**/*.e2e-spec.ts",
      "test/**/*.test.ts",
      "test/**/*.spec.ts",
      "test/**/*.e2e-spec.ts",
    ],
    // Run test files serially so mongodb-memory-server binary lock is never
    // contested between parallel forks, and AppModule bootstrap (which connects
    // to MongoDB) shares the single in-memory instance started in setup.ts.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/main.ts"],
    },
  },
  plugins: [
    tsconfigPaths({ projects: ["tsconfig.test.json"] }),
    swc.vite({
      // `module: es6` is required for Vitest (ESM); decorator metadata still emits.
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }),
  ],
});
