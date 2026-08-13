import { defineConfig, devices } from '@playwright/test'

const FOUNDRY_URL = process.env.FOUNDRY_URL || 'http://localhost:30000'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  globalSetup: './e2e/global-setup.js',
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: FOUNDRY_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1366, height: 768 }
  },
  projects: [
    {
      name: 'chromium',
      // Override devices['Desktop Chrome']'s own viewport with the one above.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } }
    }
  ]
})
