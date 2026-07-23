import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestedOutput = process.argv[2]
  ?? 'evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/runtime-v3';
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
const port = Number(process.env.KYX_PRESS_HALL_CAPTURE_PORT ?? 4332);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('KYX_PRESS_HALL_CAPTURE_PORT_INVALID');
}
const origin = `http://${host}:${port}`;
const route = '/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.2%2Fspatial-material-joined';
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
      // Connection refusals are expected until Vite binds the requested port.
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

async function fingerprint(relativePath) {
  const bytes = await readFile(path.join(repoRoot, relativePath));
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

const sourcePaths = [
  'src/app/pressHallInspectionSelection.ts',
  'src/app/pressHallInspectionRoute.ts',
  'src/main.js',
  'index.html',
  'src/content/maps/constants.ts',
  'src/content/maps/catalog.ts',
  'src/authority/inkfallMapIdentity.ts',
  'tests/unit/app/pressHallInspectionSelection.test.ts',
  'tests/browser/press-hall-runtime-inspection.spec.ts',
  'tools/evidence/capture-phase9-g8-press-hall-runtime-v3-2.mjs',
  'tools/evidence/verify-phase9-g8-press-hall-runtime-v3-2.mjs',
  'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/export/inkfall_foundry_press_hall_readability_v3_2.spatial-material-joined.glb',
  'assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb',
  'assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb',
  'assets/source/maps/inkfall-foundry/runtime/map.package.v2.json',
  'assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json',
  'assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json',
];

let browser;
let context;
let cdp;
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  context = await browser.newContext({
    viewport: { width: 1_600, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const browserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    requestedUrls: [],
    responses: [],
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
  page.on('response', async (response) => {
    if (response.status() >= 400) {
      browserDiagnostics.httpErrors.push(`${response.status()} ${response.url()}`);
    }
    if (new URL(response.url()).pathname.endsWith('.glb')) {
      browserDiagnostics.responses.push({
        url: response.url(),
        status: response.status(),
        contentLength: response.headers()['content-length'] ?? null,
        contentType: response.headers()['content-type'] ?? null,
      });
    }
  });

  const documentResponse = await page.goto(`${origin}${route}`, {
    waitUntil: 'networkidle',
    timeout: 45_000,
  });
  assert(documentResponse?.ok(), `document response ${documentResponse?.status()}`);
  await page.locator('body[data-press-hall-status="ready"]').waitFor({ timeout: 90_000 });
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.startCameraSweep());
  await page.waitForFunction(() => (
    window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot()?.camera?.sweep?.status === 'complete'
  ), undefined, { timeout: 20_000 });

  const gameplayArtOnlyPath = path.join(outputDirectory, 'gameplay-art-only.png');
  const gameplayAuthorityPath = path.join(outputDirectory, 'gameplay-authority-overlay.png');
  const overheadAuthorityPath = path.join(outputDirectory, 'overhead-authority-overlay.png');
  await page.evaluate(() => {
    window.__KYX_PRESS_HALL_INSPECTION__?.selectView('gameplay');
    window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(false);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: gameplayArtOnlyPath, fullPage: false });
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(true));
  await page.waitForTimeout(350);
  await page.screenshot({ path: gameplayAuthorityPath, fullPage: false });
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.selectView('overhead'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: overheadAuthorityPath, fullPage: false });

  const routeSnapshot = await page.evaluate(() => ({
    evidence: window.__KYX_PRESS_HALL_INSPECTION__?.getSnapshot(),
    evidenceDescriptor: Object.getOwnPropertyDescriptor(
      window,
      '__KYX_PRESS_HALL_INSPECTION__',
    ),
    bodyDataset: { ...document.body.dataset },
    title: document.title,
    visibleText: document.body.innerText,
    canvas: {
      width: document.querySelector('canvas')?.width ?? null,
      height: document.querySelector('canvas')?.height ?? null,
      dataLength: document.querySelector('canvas')?.toDataURL('image/png').length ?? 0,
    },
  }));
  const performanceMetrics = metricMap((await cdp.send('Performance.getMetrics')).metrics);
  const domCounters = await cdp.send('Memory.getDOMCounters');
  const evidence = routeSnapshot.evidence;
  assert(evidence?.status === 'PRESS_HALL_V3_2_RUNTIME_INSPECTION_READY_G5_G8_OPEN', 'route status');
  assert(evidence?.selection?.reference === 'inkfall_foundry@2/press_hall/v3.2/spatial-material-joined', 'selection');
  assert(evidence?.catalogDefault?.mapRevision === 1 && evidence?.catalogDefault?.unchanged === true, 'default preserved');
  assert(evidence?.art?.sha256 === '56cbd313e3fd2166c70ce6cca614e02f08fd027acf2b0a43749cf076c46f8119', 'art hash');
  assert(evidence?.art?.bytes === 13_300_676, 'art bytes');
  assert(evidence?.art?.primitiveCount === 29 && evidence?.art?.triangleCount === 188_576, 'art structure');
  assert(evidence?.art?.materialEncoding?.explicitBaseColorFactorCount === 0
    && evidence?.art?.materialEncoding?.baseColorTextureReferenceCount === 0
    && evidence?.art?.materialEncoding?.runtimeColorParityWithBlenderReview === false, 'runtime material payload blocker');
  assert(evidence?.authorityAlignment?.fixtureHash === 'bf85e42731fd088e', 'authority fixture');
  assert(evidence?.authorityAlignment?.solidColliderCount === 339, 'authority cardinality');
  assert(evidence?.authorityAlignment?.artGeometryMayBeAuthority === false, 'authority separation');
  assert(evidence?.renderer?.artOnly?.calls > 0 && evidence?.renderer?.artOnly?.calls <= 29, 'actual art calls');
  assert(evidence?.renderer?.artOnly?.triangles > 0 && evidence?.renderer?.artOnly?.triangles <= 188_576, 'actual art triangles');
  assert(evidence?.renderer?.artPlusAuthorityOverlay?.calls > evidence?.renderer?.artOnly?.calls, 'overlay calls');
  assert(evidence?.performance?.frameTimes?.count === 180, 'frame profile count');
  assert(evidence?.camera?.sweep?.status === 'complete' && evidence?.camera?.sweep?.completedSegments === 4, 'camera sweep');
  assert(evidence?.camera?.sweep?.collisionNoSnagClaim === false, 'no false no-snag claim');
  assert(evidence?.productBoundary?.shippingDefaultChanged === false, 'shipping default boundary');
  assert(evidence?.productBoundary?.g5Passed === false && evidence?.productBoundary?.g8Passed === false, 'open gates');
  assert(routeSnapshot.evidenceDescriptor?.writable === false, 'surface writable');
  assert(routeSnapshot.evidenceDescriptor?.configurable === false, 'surface configurable');
  assert(routeSnapshot.canvas.dataLength > 20_000, 'canvas rendered');

  const distinctGlbRequests = [...new Set(browserDiagnostics.requestedUrls
    .map((url) => new URL(url).pathname)
    .filter((pathname) => pathname.endsWith('.glb')))];
  assert(distinctGlbRequests.length === 3, `three GLB requests ${JSON.stringify(distinctGlbRequests)}`);
  assert(browserDiagnostics.consoleErrors.length === 0, 'console errors');
  assert(browserDiagnostics.pageErrors.length === 0, 'page errors');
  assert(browserDiagnostics.failedRequests.length === 0, 'failed requests');
  assert(browserDiagnostics.httpErrors.length === 0, 'HTTP errors');
  assert(browserDiagnostics.requestedUrls.every((url) => {
    const parsed = new URL(url);
    return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin === origin;
  }), 'external request');

  const screenshots = Object.fromEntries(await Promise.all(Object.entries({
    gameplayArtOnly: gameplayArtOnlyPath,
    gameplayAuthorityOverlay: gameplayAuthorityPath,
    overheadAuthorityOverlay: overheadAuthorityPath,
  }).map(async ([id, absolutePath]) => {
    const bytes = await readFile(absolutePath);
    return [id, {
      path: path.relative(repoRoot, absolutePath).replaceAll('\\', '/'),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      viewport: { width: 1_600, height: 900 },
    }];
  })));
  const sources = Object.fromEntries(await Promise.all(sourcePaths.map(async (relativePath) => (
    [relativePath, await fingerprint(relativePath)]
  ))));
  const capture = {
    schemaVersion: 1,
    status: 'PRESS_HALL_V3_2_BOUNDED_RUNTIME_CAPTURE_PASS_G5_G8_OPEN',
    capturedAt: new Date().toISOString(),
    scope: 'G5_G8_NON_DEFAULT_PRESS_HALL_V3_2_RUNTIME_INSPECTION',
    origin,
    route,
    host: {
      machineName: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model ?? null,
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytesAtCapture: os.freemem(),
    },
    browser: {
      product: 'Chromium',
      version: browser.version(),
      headless: true,
      softwareRendererRequested: true,
      viewport: { width: 1_600, height: 900, deviceScaleFactor: 1 },
      runtimeIdentity: evidence.performance.namedBrowserHost,
    },
    routeSnapshot,
    cdp: {
      jsHeapUsedBytes: performanceMetrics.JSHeapUsedSize ?? null,
      jsHeapTotalBytes: performanceMetrics.JSHeapTotalSize ?? null,
      taskDurationSeconds: performanceMetrics.TaskDuration ?? null,
      scriptDurationSeconds: performanceMetrics.ScriptDuration ?? null,
      layoutDurationSeconds: performanceMetrics.LayoutDuration ?? null,
      domCounters,
    },
    network: {
      distinctGlbRequests,
      glbResponses: browserDiagnostics.responses,
      requestCount: browserDiagnostics.requestedUrls.length,
      externalRequests: browserDiagnostics.requestedUrls.filter((url) => {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin !== origin;
      }),
    },
    browserDiagnostics,
    screenshots,
    sources,
    assessment: {
      boundedRuntimeIntegration: 'PASS',
      exactArtHashAndThreeLoader: 'PASS',
      separateRevision2AuthorityOverlay: 'PASS',
      actualRendererProfile: 'PASS',
      runtimeMaterialColorParity: 'FAIL_GLTF_HAS_ZERO_EXPLICIT_BASE_COLORS_AND_ZERO_BASE_COLOR_TEXTURES',
      boundedCameraSweep: 'PASS_VISUAL_ONLY',
      collisionNoSnag: 'NOT_PROVEN',
      finalNamedHardwarePerformance: 'NOT_PROVEN',
      thirtyMinuteSoak: 'NOT_RUN',
      humanVisualAcceptance: 'NOT_PERFORMED',
      humanPlaytestAcceptance: 'NOT_PERFORMED',
      g5: 'OPEN',
      g8: 'OPEN',
    },
    nonClaims: evidence.nonClaims,
  };
  await writeFile(
    path.join(outputDirectory, 'capture.json'),
    `${JSON.stringify(capture, null, 2)}\n`,
    { flag: 'wx' },
  );
  process.stdout.write(`${JSON.stringify({
    status: capture.status,
    outputDirectory,
    host: capture.host,
    browser: capture.browser,
    renderer: evidence.renderer,
    frameTimes: evidence.performance.frameTimes,
    loadTimingMs: evidence.performance.loadTimingMs,
    screenshots,
  }, null, 2)}\n`);
} finally {
  await cdp?.detach().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.exitCode === null) server.kill();
}
