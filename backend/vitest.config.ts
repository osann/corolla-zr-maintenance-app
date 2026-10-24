import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The browser smoke tests have their own config (vitest.e2e.config.ts, npm run test:e2e).
    exclude: ['test/e2e/**'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Each test file gets its own throwaway SQLite DB (see setup.ts); seeding takes a moment.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
