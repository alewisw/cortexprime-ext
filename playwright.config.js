import { defineConfig, devices } from '@playwright/test'

const FOUNDRY_URL = process.env.FOUNDRY_URL || 'http://localhost:30000'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  globalSetup: './e2e/global-setup.js',
  // Generous: a spec opening three real sessions spends ~15-20s per login
  // before it asserts anything, and this drives a live app rather than a
  // stub.
  timeout: 180_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: FOUNDRY_URL,
    // Playwright's default is 0, i.e. wait forever. A click on something that never becomes
    // actionable - covered by an overlay, say - would then hang until the 180s test timeout, and
    // a timed-out test takes its cleanup down with it. Matching expect.timeout makes that fail
    // in 15s, naming the locator that could not be clicked.
    actionTimeout: 15_000,
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
