import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT) || 4100;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://localhost:${port}`, headless: true, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node app/server.js',
    url: `http://localhost:${port}/api/me`,
    // Never reuse: a running server may have other bugs on or leftover stock.
    reuseExistingServer: false,
    env: { PORT: String(port), BUGS: process.env.BUGS ?? '' },
  },
});
