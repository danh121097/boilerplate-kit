import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Real-Redis lane (`pnpm test:redis`). Needs REDIS_URL pointing at a disposable Redis;
 * without it the lane runs nothing and says so, so the default `pnpm test` is untouched.
 */
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.warn(
    "[test:redis] REDIS_URL is not set - skipping the real-Redis lane. Example: REDIS_URL=redis://127.0.0.1:6379 pnpm test:redis",
  );
}

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["tsconfig.test.json"] })],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: redisUrl ? ["src/__tests__/redis/**/*.redis.ts"] : [],
    passWithNoTests: true,
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
