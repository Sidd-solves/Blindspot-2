import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      // The analysis engine, typed tools and API server; the React screens are checked in the browser instead.
      include: ['packages/*/src/**', 'services/*/src/**', 'apps/web/src/components/latestRequest.ts'],
      reporter: ['text-summary', 'json-summary'],
    },
  },
});
