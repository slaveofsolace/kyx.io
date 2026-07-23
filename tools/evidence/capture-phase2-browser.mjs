import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputDirectory = path.resolve(
  repositoryRoot,
  'evidence',
  '2026-07-19',
  'phase-2-toolchain-contracts',
  'browser',
);
const screenshotsDirectory = path.join(outputDirectory, 'screenshots');
const host = '127.0.0.1';
const port = 4176;
const baseUrl = `http://${host}:${port}`;
const summaryPath = path.join(outputDirectory, 'phase2-browser-summary.json');
const serverStdout = [];
const serverStderr = [];
const checks = [];
const network = {
  requests: [],
  failedRequests: [],
  webSockets: [],
  console: [],
  pageErrors: [],
};

function check(id, passed, details = {}) {
  const result = { id, passed: Boolean(passed), details };
  checks.push(result);
  process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'} ${id}\n`);
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseUrl, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // The direct Vite child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${baseUrl}`);
}

await mkdir(screenshotsDirectory, { recursive: true });
const vite = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', host, '--port', String(port), '--strictPort'],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
vite.stdout.setEncoding('utf8');
vite.stderr.setEncoding('utf8');
vite.stdout.on('data', (chunk) => serverStdout.push(chunk));
vite.stderr.on('data', (chunk) => serverStderr.push(chunk));

let browser;
let fatalError = null;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/u.test(url)) network.requests.push({ method: request.method(), url });
  });
  page.on('requestfailed', (request) => {
    network.failedRequests.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown',
    });
  });
  page.on('websocket', (socket) => network.webSockets.push(socket.url()));
  page.on('console', (message) => network.console.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => network.pageErrors.push(error.message));

  await page.goto(`${baseUrl}/__test__/determinism`, { waitUntil: 'networkidle' });
  await page.locator('body[data-determinism-status="pass"]').waitFor({ timeout: 15_000 });
  const firstPayload = JSON.parse(await page.locator('#determinism-result').innerText());
  check('route.profile', firstPayload.profile === 'authority_20hz', { actual: firstPayload.profile });
  check('route.tick_duration', firstPayload.tickDurationMs === 50, { actual: firstPayload.tickDurationMs });
  check('route.final_tick', firstPayload.finalTick === 6, { actual: firstPayload.finalTick });
  check('route.final_hash', firstPayload.finalStateHash === 'd7201dfc006e72ee', {
    actual: firstPayload.finalStateHash,
  });
  check('route.entity_count', firstPayload.entityCount === 2, { actual: firstPayload.entityCount });
  check('route.event_count', firstPayload.eventCount === 6, { actual: firstPayload.eventCount });
  check('route.no_canvas', await page.locator('canvas').count() === 0);
  await page.screenshot({
    path: path.join(screenshotsDirectory, 'phase2-determinism-route-1600x900.png'),
    animations: 'disabled',
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('body[data-determinism-status="pass"]').waitFor({ timeout: 15_000 });
  const secondPayload = JSON.parse(await page.locator('#determinism-result').innerText());
  check('route.repeat_hash', secondPayload.finalStateHash === firstPayload.finalStateHash, {
    first: firstPayload.finalStateHash,
    second: secondPayload.finalStateHash,
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForFunction(() => {
    const serialized = document.getElementById('game-canvas')?.dataset.kyxDevMetrics;
    if (!serialized) return false;
    try {
      const metrics = JSON.parse(serialized);
      return metrics.schemaVersion === 1 && metrics.frameTimes?.count > 0;
    } catch {
      return false;
    }
  }, null, { timeout: 10_000 });
  const metrics = await page.evaluate(() => JSON.parse(
    document.getElementById('game-canvas').dataset.kyxDevMetrics,
  ));
  check('metrics.schema', metrics.schemaVersion === 1, { actual: metrics.schemaVersion });
  check('metrics.state', metrics.state === 'menu', { actual: metrics.state });
  check('metrics.render_counters', (
    metrics.renderRange?.count > 0
      && metrics.renderRange?.maxCalls > 0
      && metrics.renderRange?.maxTriangles > 0
  ), { renderRange: metrics.renderRange });
  check('metrics.frame_percentiles', (
    metrics.frameTimes?.count > 0
      && metrics.frameTimes.p50Ms <= metrics.frameTimes.p95Ms
      && metrics.frameTimes.p95Ms <= metrics.frameTimes.p99Ms
      && metrics.frameTimes.p99Ms <= metrics.frameTimes.maxMs
  ), { frameTimes: metrics.frameTimes });
  check('metrics.no_mutable_game_global', await page.evaluate(() => !Object.hasOwn(window, 'game')));
  await page.screenshot({
    path: path.join(screenshotsDirectory, 'phase2-renderer-metrics-menu-1600x900.png'),
    animations: 'disabled',
  });

  const origins = [...new Set(network.requests.map(({ url }) => new URL(url).origin))].sort();
  const applicationSockets = network.webSockets.filter((url) => {
    const socket = new URL(url);
    return !(socket.hostname === host && socket.searchParams.has('token'));
  });
  check('browser.same_origin', origins.every((origin) => origin === baseUrl), { origins });
  check('browser.no_failed_requests', network.failedRequests.length === 0, {
    failedRequests: network.failedRequests,
  });
  check('browser.no_application_websocket', applicationSockets.length === 0, {
    sockets: network.webSockets,
    applicationSockets,
  });
  check('browser.no_console_errors', network.console.every(({ type }) => type !== 'error'), {
    consoleErrors: network.console.filter(({ type }) => type === 'error'),
  });
  check('browser.no_page_errors', network.pageErrors.length === 0, { pageErrors: network.pageErrors });

  await context.close();
} catch (error) {
  fatalError = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
} finally {
  await browser?.close();
  if (vite.exitCode === null) {
    vite.kill();
    await Promise.race([
      once(vite, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  await writeFile(path.join(outputDirectory, 'vite.stdout.log'), serverStdout.join(''), 'utf8');
  await writeFile(path.join(outputDirectory, 'vite.stderr.log'), serverStderr.join(''), 'utf8');
}

const failures = checks.filter(({ passed }) => !passed);
const summary = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  baseUrl,
  viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
  expectedReplay: {
    profile: 'authority_20hz',
    tickDurationMs: 50,
    finalTick: 6,
    finalStateHash: 'd7201dfc006e72ee',
    entityCount: 2,
    eventCount: 6,
  },
  checks,
  failures,
  network,
  screenshots: [
    'screenshots/phase2-determinism-route-1600x900.png',
    'screenshots/phase2-renderer-metrics-menu-1600x900.png',
  ],
  server: {
    exactChildPid: vite.pid ?? null,
    exitCode: vite.exitCode,
    signalCode: vite.signalCode,
    terminated: vite.exitCode !== null || vite.signalCode !== null,
  },
  fatalError,
  ok: fatalError === null
    && failures.length === 0
    && (vite.exitCode !== null || vite.signalCode !== null),
};
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: summary.ok,
  summaryPath,
  checks: checks.length,
  failures: failures.map(({ id }) => id),
  fatalError,
}, null, 2)}\n`);
if (!summary.ok) process.exitCode = 1;
