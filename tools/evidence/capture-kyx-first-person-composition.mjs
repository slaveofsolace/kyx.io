import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const port = Number(process.env.KYX_COMPOSITION_PORT ?? 6251);
const origin = `http://127.0.0.1:${port}`;
const viteEntry = path.resolve('node_modules/vite/bin/vite.js');
const outputDirectory = path.resolve(
  process.argv[2]
  ?? '../review-evidence/first-person-composition',
);

const CAPTURES = Object.freeze([
  { name: 'weapon-hip', cam: 'press', weapon: 'hip' },
  { name: 'weapon-ads', cam: 'press', weapon: 'ads' },
  { name: 'weapon-reload', cam: 'press', weapon: 'reload' },
  { name: 'map-spawn', cam: 'spawn', weapon: 'none' },
  { name: 'map-press', cam: 'press', weapon: 'none' },
  { name: 'map-portal', cam: 'portal', weapon: 'none' },
  { name: 'map-overhead', cam: 'overhead', weapon: 'none' },
]);

const server = spawn(
  process.execPath,
  [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(origin, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`COMPOSITION_VITE_TIMEOUT\n${serverLog}`);
}

let browser;
try {
  await waitForServer();
  await mkdir(outputDirectory, { recursive: true });
  browser = await chromium.launch();
  const results = [];
  for (const capture of CAPTURES) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const query = new URLSearchParams({
      cam: capture.cam,
      weapon: capture.weapon,
    });
    await page.goto(
      `${origin}/tools/evidence/first-person-composition-gallery.html?${query}`,
      { waitUntil: 'networkidle' },
    );
    await page.waitForFunction(
      () => document.body.dataset.compositionReady === 'true'
        || document.body.dataset.compositionError !== undefined,
      null,
      { timeout: 60_000 },
    );
    const pageError = await page.evaluate(
      () => document.body.dataset.compositionError,
    );
    if (pageError !== undefined) {
      throw new Error(`COMPOSITION_PAGE_ERROR ${capture.name}: ${pageError}`);
    }
    if (errors.length > 0) {
      throw new Error(
        `COMPOSITION_BROWSER_ERRORS ${capture.name}\n${errors.join('\n')}`,
      );
    }
    const evidence = await page.evaluate(() => window.__compositionEvidence);
    const screenshot = path.join(outputDirectory, `${capture.name}.png`);
    await page.screenshot({ path: screenshot });
    results.push({
      ...capture,
      evidence,
      screenshot: path.basename(screenshot),
    });
    await page.close();
  }
  const summary = {
    status: 'KYX_FIRST_PERSON_COMPOSITION_CAPTURE_PASS',
    capturedAt: new Date().toISOString(),
    viewport: '1440x900',
    captures: results,
  };
  await writeFile(
    path.join(outputDirectory, 'composition-capture-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  if (browser !== undefined) await browser.close();
  server.kill('SIGTERM');
}
