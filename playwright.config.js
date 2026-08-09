import { defineConfig, devices } from '@playwright/test';

const host = '127.0.0.1';
const port = Number(process.env.KYX_PLAYWRIGHT_PORT ?? 4175);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('KYX_PLAYWRIGHT_PORT must be an integer from 1 through 65535');
}
// Movement evidence tests deliberately open several software-rendered WebGL pages.
// Serialize by default so host CPU contention cannot consume the per-test timeout.
const workers = Number(process.env.KYX_PLAYWRIGHT_WORKERS ?? 1);
if (!Number.isInteger(workers) || workers < 1 || workers > 32) {
  throw new Error('KYX_PLAYWRIGHT_WORKERS must be an integer from 1 through 32');
}
const baseURL = `http://${host}:${port}`;
const executablePath = process.env.KYX_PLAYWRIGHT_EXECUTABLE_PATH?.trim();
const viteCommand = `"${process.execPath}" node_modules/vite/bin/vite.js --host ${host} --port ${port} --strictPort`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers,
  reporter: 'list',
  outputDir: './node_modules/.cache/playwright-results',
  use: {
    baseURL,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'chromium-mobile-unsupported',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],
  webServer: {
    command: viteCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
