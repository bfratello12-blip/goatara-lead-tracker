import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      PORT: '3015',
      VITE_PORT: '5175',
      HOST: '127.0.0.1',
      DEMO_MODE: 'true',
      DATABASE_PATH: ':memory:',
      APP_ORIGIN: 'http://127.0.0.1:5175',
      LEAD_WEBHOOK_SECRET: 'e2e-only-webhook-secret-with-more-than-32-characters',
    },
  },
});
