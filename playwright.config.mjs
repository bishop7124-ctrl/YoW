import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT || 4173)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `VITE_OFFLINE_MODE=true npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Opt-in only, never affects CI: some sandboxed dev environments
        // pre-install a Chromium revision that doesn't match this repo's
        // pinned @playwright/test version, so `npx playwright install`
        // fails to resolve one relative to a different revision folder.
        // Setting this env var points Playwright at that pre-installed
        // binary directly instead. Unset (the default, and always the case
        // in CI) leaves Playwright's normal executable resolution alone.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
          : {}),
      },
    },
  ],
})
