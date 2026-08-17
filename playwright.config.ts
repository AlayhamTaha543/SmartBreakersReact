import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const ci = Boolean(process.env.CI)

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 2 : 0,
  workers: ci ? 1 : undefined,
  reporter: ci
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  expect: {
    timeout: 8_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:8791',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'Asia/Damascus',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}{ext}',
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8791',
    url: 'http://127.0.0.1:8791',
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
})
