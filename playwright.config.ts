import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 0,
  use: { baseURL: process.env.APP_URL || 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.APP_URL ? undefined : {
    command: 'npm run build && FRONTEND_DIR=dist PORT=4173 cargo run',
    url: 'http://127.0.0.1:4173/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
});
