import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestedOutput = process.argv[2]
  ?? 'evidence/2026-07-22/phase-6-g5-product-map-selection/runs/local-v1';
const outputDirectory = path.resolve(repoRoot, requestedOutput);
const evidenceRoot = path.resolve(repoRoot, 'evidence');
if (outputDirectory !== evidenceRoot && !outputDirectory.startsWith(`${evidenceRoot}${path.sep}`)) {
  throw new Error('OUTPUT_MUST_BE_WITHIN_EVIDENCE_ROOT');
}
try {
  await access(outputDirectory);
  throw new Error(`OUTPUT_ALREADY_EXISTS ${outputDirectory}`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith('OUTPUT_ALREADY_EXISTS')) throw error;
}
await mkdir(outputDirectory, { recursive: true });

const host = '127.0.0.1';
const port = Number(process.env.KYX_G5_CAPTURE_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('KYX_G5_CAPTURE_PORT_INVALID');
}
const origin = `http://${host}:${port}`;
const serverLog = [];
const server = spawn(process.execPath, [
  'node_modules/vite/bin/vite.js',
  '--host', host,
  '--port', String(port),
  '--strictPort',
], {
  cwd: repoRoot,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`VITE_EXITED_${server.exitCode} ${serverLog.join('').trim()}`);
    }
    try {
      const response = await fetch(origin, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // Startup connection refusals are expected until Vite binds the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`VITE_START_TIMEOUT ${serverLog.join('').trim()}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(`CAPTURE_ASSERTION_FAILED ${message}`);
}

async function fileHash(relativePath) {
  return sha256(await readFile(path.join(repoRoot, relativePath)));
}

const sourcePaths = [
  'src/app/lockedGrayboxSelection.ts',
  'src/app/lockedGrayboxPreviewRoute.ts',
  'src/content/maps/catalog.ts',
  'src/content/maps/constants.ts',
  'src/main.js',
  'index.html',
  'src/style.css',
  'tests/unit/app/lockedGrayboxSelection.test.ts',
  'tests/browser/locked-graybox-preview.spec.ts',
  'tools/evidence/capture-phase6-g5-product-map-selection.mjs',
  'tools/evidence/verify-phase6-g5-product-map-selection.mjs',
];

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    requestedUrls: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') browserDiagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserDiagnostics.pageErrors.push(error.message));
  page.on('request', (request) => browserDiagnostics.requestedUrls.push(request.url()));
  page.on('requestfailed', (request) => {
    browserDiagnostics.failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) browserDiagnostics.httpErrors.push(
      `${response.status()} ${response.url()}`,
    );
  });

  await page.goto(`${origin}/?mapPackage=inkfall_foundry%402`, { waitUntil: 'networkidle' });
  await page.locator('body[data-map-preview-status="ready"]').waitFor({ timeout: 30_000 });
  const routeSnapshot = await page.evaluate(() => ({
    evidence: window.__KYX_LOCKED_GRAYBOX_PREVIEW__?.getSnapshot(),
    evidenceDescriptor: Object.getOwnPropertyDescriptor(
      window,
      '__KYX_LOCKED_GRAYBOX_PREVIEW__',
    ),
    bodyDataset: { ...document.body.dataset },
    title: document.title,
    canvasDataLength: document.querySelector('canvas')?.toDataURL('image/png').length ?? 0,
    returnHref: document.querySelector('.locked-map__return')?.getAttribute('href') ?? null,
    visibleText: document.body.innerText,
  }));
  assert(routeSnapshot.evidence?.status === 'LOCKED_GRAYBOX_EXPLICIT_PREVIEW_READY_G5_OPEN', 'status');
  assert(routeSnapshot.evidence?.selection?.reference === 'inkfall_foundry@2', 'selection');
  assert(routeSnapshot.evidence?.catalogDefault?.mapRevision === 1, 'default revision');
  assert(routeSnapshot.evidence?.assets?.render?.role === 'render_only', 'render role');
  assert(routeSnapshot.evidence?.assets?.authorityCollision?.role === 'authority_collision', 'collision role');
  assert(routeSnapshot.evidence?.assets?.requestedSeparately === true, 'separate requests flag');
  assert(routeSnapshot.evidence?.productBoundary?.loadedIntoOfflinePractice === false, 'practice boundary');
  assert(routeSnapshot.evidence?.productBoundary?.g5Passed === false, 'G5 boundary');
  assert(routeSnapshot.evidenceDescriptor?.writable === false, 'evidence writable');
  assert(routeSnapshot.evidenceDescriptor?.configurable === false, 'evidence configurable');
  assert(routeSnapshot.canvasDataLength > 8_000, 'authority plan canvas');
  assert(routeSnapshot.visibleText.includes('G5 REMAINS OPEN'), 'visible G5 nonclaim');
  assert(routeSnapshot.visibleText.includes('Offline Practice unchanged'), 'visible practice boundary');

  const artifactRequests = browserDiagnostics.requestedUrls.filter((url) => (
    new URL(url).pathname.endsWith('.glb')
  ));
  const distinctArtifactRequestPaths = [...new Set(
    artifactRequests.map((url) => new URL(url).pathname),
  )].sort();
  assert(
    distinctArtifactRequestPaths.length === 2,
    `two distinct artifact requests ${JSON.stringify(artifactRequests)}`,
  );
  assert(browserDiagnostics.consoleErrors.length === 0, 'console errors');
  assert(browserDiagnostics.pageErrors.length === 0, 'page errors');
  assert(browserDiagnostics.failedRequests.length === 0, 'failed requests');
  assert(browserDiagnostics.httpErrors.length === 0, 'HTTP errors');
  assert(browserDiagnostics.requestedUrls.every((url) => {
    const parsed = new URL(url);
    return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin === origin;
  }), 'external request');

  const routeScreenshotPath = path.join(outputDirectory, 'locked-graybox-preview.png');
  await page.screenshot({ path: routeScreenshotPath, fullPage: true });

  const entryPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const entryErrors = [];
  entryPage.on('console', (message) => {
    if (message.type() === 'error') entryErrors.push(`console: ${message.text()}`);
  });
  entryPage.on('pageerror', (error) => entryErrors.push(`page: ${error.message}`));
  await entryPage.goto(origin, { waitUntil: 'domcontentloaded' });
  const entryLink = entryPage.locator('#locked-graybox-preview-link');
  await entryLink.waitFor({ state: 'visible', timeout: 15_000 });
  assert(await entryLink.getAttribute('href') === '?mapPackage=inkfall_foundry%402', 'entry href');
  await entryPage.waitForTimeout(1_200);
  assert(entryErrors.length === 0, 'entry page errors');
  const entryScreenshotPath = path.join(outputDirectory, 'product-entry-selection.png');
  await entryPage.screenshot({ path: entryScreenshotPath, fullPage: false });

  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async (relativePath) => (
    [relativePath, await fileHash(relativePath)]
  ))));
  const capture = {
    schemaVersion: 1,
    status: 'G5_PRODUCT_MAP_SELECTION_EVIDENCE_READY_G5_OPEN',
    capturedAt: new Date().toISOString(),
    origin,
    route: '/?mapPackage=inkfall_foundry%402',
    routeSnapshot,
    artifactRequests: distinctArtifactRequestPaths,
    browserDiagnostics,
    entry: {
      href: await entryLink.getAttribute('href'),
      label: await entryLink.textContent(),
      errors: entryErrors,
    },
    screenshots: {
      lockedGrayboxPreview: {
        path: path.relative(repoRoot, routeScreenshotPath).replaceAll('\\', '/'),
        sha256: sha256(await readFile(routeScreenshotPath)),
      },
      productEntrySelection: {
        path: path.relative(repoRoot, entryScreenshotPath).replaceAll('\\', '/'),
        sha256: sha256(await readFile(entryScreenshotPath)),
      },
    },
    sourceHashes,
    nonClaims: [
      'G5_NOT_PASSED',
      'LOCKED_GRAYBOX_NOT_LOADED_INTO_OFFLINE_PRACTICE',
      'NO_FINAL_ART_ACCEPTANCE',
      'NO_HUMAN_PLAYTEST_ACCEPTANCE',
      'NO_PERFORMANCE_ACCEPTANCE',
      'NO_SHIPPING_OR_DEPLOYMENT_PROMOTION',
    ],
  };
  await writeFile(
    path.join(outputDirectory, 'capture.json'),
    `${JSON.stringify(capture, null, 2)}\n`,
    { flag: 'wx' },
  );
  console.log(JSON.stringify({
    status: capture.status,
    outputDirectory,
    artifactRequests: capture.artifactRequests,
    screenshotHashes: Object.fromEntries(Object.entries(capture.screenshots).map(
      ([key, value]) => [key, value.sha256],
    )),
  }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  if (server.exitCode === null) server.kill();
}
