import { defineConfig } from 'vitest/config';

// Browser smoke tests (npm run test:e2e): the real backend on a throwaway DB, the frontend served
// beside it, headless Chromium. Kept out of `npm test` because they need a browser and take longer.
export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
