import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 4183;
const BASE_URL = `http://${HOST}:${PORT}`;
const ROUTE_URL = `${BASE_URL}/__test__/map`;
const OUTPUT_ROOT = path.resolve('evidence/2026-07-21/phase-6-p6-3-runtime-map');
const SCREENSHOT_PATH = path.join(OUTPUT_ROOT, 'screenshots/inkfall-map-runtime.png');
const RESULT_PATH = path.join(OUTPUT_ROOT, 'runtime-map-capture.json');
const ENVIRONMENT_PATH = path.join(OUTPUT_ROOT, 'environment.json');
const COMMANDS_PATH = path.join(OUTPUT_ROOT, 'commands.txt');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function portIsServing() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(500) });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsServing()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${BASE_URL}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

if (await portIsServing()) throw new Error(`Evidence port ${PORT} is already in use.`);
await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });

const viteOutput = [];
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
server.stdout.on('data', (chunk) => viteOutput.push(String(chunk)));
server.stderr.on('data', (chunk) => viteOutput.push(String(chunk)));

let browser;
let result;
try {
  await waitForServer(30_000);
  browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const httpErrors = [];
  const artifactResponses = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
    const url = new URL(response.url());
    if (url.pathname.endsWith('.glb') && url.search === '') {
      artifactResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(ROUTE_URL, { waitUntil: 'networkidle' });
  await page.locator('body[data-map-status="ready"]').waitFor({ state: 'attached', timeout: 30_000 });
  const snapshot = await page.evaluate(() => window.__KYX_MAP_EVIDENCE__?.getSnapshot());
  if (!snapshot) throw new Error('Read-only map evidence surface was not published.');
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  const screenshotBytes = await readFile(SCREENSHOT_PATH);
  result = {
    schemaVersion: 1,
    capturedAtUtc: new Date().toISOString(),
    route: ROUTE_URL,
    browser: { name: 'chromium', version: browserVersion, viewport: { width: 1600, height: 1000 } },
    pageState: {
      launchSupport: await page.locator('body').getAttribute('data-launch-support'),
      mapStatus: await page.locator('body').getAttribute('data-map-status'),
    },
    snapshot,
    artifactResponses,
    diagnostics: { consoleErrors, pageErrors, failedRequests, httpErrors },
    screenshot: {
      path: path.relative(process.cwd(), SCREENSHOT_PATH).replaceAll('\\', '/'),
      bytes: screenshotBytes.byteLength,
      sha256: sha256(screenshotBytes),
    },
    assertions: {
      mapReady: await page.locator('body').getAttribute('data-map-status') === 'ready',
      exactArtifactResponses: artifactResponses.length === 2
        && artifactResponses.every(({ status }) => status === 200),
      noRuntimeErrors: [consoleErrors, pageErrors, failedRequests, httpErrors]
        .every((entries) => entries.length === 0),
      renderExcludedFromAuthority: snapshot.renderMeshesMayBeAuthority === false
        && snapshot.renderSha256 !== snapshot.authorityCollisionSha256,
      expectedCounts: snapshot.renderMeshNodeCount === 346
        && snapshot.authorityCollisionMeshNodeCount === 346
        && snapshot.authorityVolumeCount === 2
        && snapshot.totalAuthorityColliderCount === 348,
      g5NotClaimed: snapshot.status === 'P6.3_RUNTIME_FIXTURE_LOADED_G5_NOT_PASSED',
    },
  };
  result.status = Object.values(result.assertions).every(Boolean) ? 'PASS' : 'FAIL';
  await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(ENVIRONMENT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    browser: result.browser,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirtyStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split(/\r?\n/u),
    viteOutput: viteOutput.join('').trim().split(/\r?\n/u),
  }, null, 2)}\n`, 'utf8');
  await writeFile(COMMANDS_PATH, [
    '# Run from repository root with the configured Node 20.19-24 runtime.',
    'node tools/evidence/capture-phase6-p63-map.mjs',
    'node tools/evidence/verify-phase6-p63-map.mjs',
    'node node_modules/vitest/vitest.mjs run tests/unit/content/mapPackage.test.ts tests/integration/physics/inkfallMapRuntime.test.ts',
    'node node_modules/@playwright/test/cli.js test tests/browser/map-package-route.spec.ts --project=chromium-desktop',
    '',
  ].join('\n'), 'utf8');
  if (result.status !== 'PASS') throw new Error('P6.3 runtime map evidence assertions failed.');
  process.stdout.write(`${JSON.stringify({ status: result.status, result: RESULT_PATH, screenshot: SCREENSHOT_PATH })}\n`);
} finally {
  await browser?.close();
  await stopServer(server);
  if (await portIsServing()) throw new Error(`Evidence port ${PORT} remained open after capture.`);
}
