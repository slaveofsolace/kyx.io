import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const webHost = '127.0.0.1';
const webPort = 5173;
const authorityPort = 8787;
const webOrigin = `http://${webHost}:${webPort}`;
const authorityOrigin = `http://${webHost}:${authorityPort}`;
const node = `"${process.execPath}"`;
const executablePath = process.env.KYX_PLAYWRIGHT_EXECUTABLE_PATH?.trim();
const durableObjectStateDirectory = mkdtempSync(join(tmpdir(), 'kyx-multiplayer-do-'));

export default defineConfig({
  testDir: './tests/multiplayer',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: 'list',
  outputDir: './node_modules/.cache/playwright-multiplayer-results',
  use: {
    baseURL: webOrigin,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium-multiplayer',
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1280, height: 720 },
    },
  }],
  webServer: [
    {
      command: `${node} node_modules/wrangler/bin/wrangler.js dev --local --persist-to "${durableObjectStateDirectory}" --ip ${webHost} --port ${authorityPort}`,
      url: `${authorityOrigin}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `${node} node_modules/vite/bin/vite.js --host ${webHost} --port ${webPort} --strictPort`,
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        VITE_KYX_AUTHORITY_ORIGIN: authorityOrigin,
      },
    },
  ],
});
