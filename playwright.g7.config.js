import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = Number(process.env.KYX_G7_PLAYWRIGHT_PORT ?? 6196);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('KYX_G7_PLAYWRIGHT_PORT must be an integer from 1 through 65535');
}

const baseURL = `http://${host}:${port}`;
const viteCommand = `"${process.execPath}" node_modules/vite/bin/vite.js --host ${host} --port ${port} --strictPort`;

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'g7-ui-presentation.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: './node_modules/.cache/playwright-g7-results',
  timeout: 45_000,
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: viteCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
