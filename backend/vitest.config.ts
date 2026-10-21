import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Each test file gets its own throwaway SQLite DB (see setup.ts); seeding takes a moment.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
