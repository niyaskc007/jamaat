import { defineConfig, devices } from '@playwright/test';

/// E2E config for Jamaat web. Tests assume:
///  - Web dev server is reachable at http://localhost:5173
///  - API is reachable at https://localhost:7024 (the app's configured base URL)
///  - The seeded admin user exists (admin@jamaat.local / Admin@12345)
/// We do NOT auto-start the dev server here - it's expected to be running already
/// (the user runs `npm run dev` and the API in their normal workflow).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // serialize - the seeded data is shared, ordering matters less but flakes drop
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker - we mutate shared state
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true, // self-signed dev cert on https://localhost:7024
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
