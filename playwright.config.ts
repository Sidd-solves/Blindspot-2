import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks of the finished app: keyboard path from a finding to its rows, the CSV download, out-of-order
 * answers after a filter change, failure → retry, undefined accuracy, and phone layout. Uses the installed Chrome.
 *   npm run e2e            (starts the API and web app if they aren't already running)
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command: 'npm run api',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    { command: 'npm run web', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
