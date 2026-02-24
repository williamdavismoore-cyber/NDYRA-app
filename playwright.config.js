// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * NDYRA Playwright config (Blueprint v7.3.1 aligned)
 * - Always spins up the static server against /site
 * - Runs two projects: Desktop Chromium + Mobile Safari
 * - Generates an HTML report for QA sanity checks
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: { timeout: 7 * 1000 },

  // Keep artifacts when failures happen
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry'
  },

  reporter: [['list'], ['html', { open: 'never' }]],

  webServer: {
    command: `node tools/static_server.cjs --port ${PORT} --root site`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  },

  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'Mobile Safari',
      // Playwright doesn't ship real Safari; iPhone profile uses WebKit which is the closest.
      use: { ...devices['iPhone 13'] }
    }
  ]
});

