import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // use the test tsconfig (includes src/__tests__) so @/ resolves in test files too
  plugins: [tsconfigPaths({ projects: ['tsconfig.test.json'] })],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/__tests__/**',
        'src/server.ts',
        'src/config/database.ts',
        'src/app.ts',
        'src/config/environment.ts',
        'src/routes/health-check.ts'
      ],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 }
    },
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
