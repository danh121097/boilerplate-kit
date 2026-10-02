import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Real-Redis lane (`pnpm test:redis`). Needs REDIS_URL pointing at a disposable Redis;
 * without it the lane runs nothing and says so, so the default `pnpm test` is untouched.
 * Same transform setup as vitest.config.ts (decorator metadata is required for DI).
 */
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.warn(
    "[test:redis] REDIS_URL is not set - skipping the real-Redis lane. Example: REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis",
  );
}

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    include: redisUrl ? ["test/redis/**/*.redis.ts"] : [],
    passWithNoTests: true,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [
    tsconfigPaths({ projects: ["tsconfig.test.json"] }),
    swc.vite({
      module: { type: "es6" },
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        keepClassNames: true,
      },
    }),
  ],
});
