import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestedOutput = process.argv[2]
  ?? 'evidence/2026-07-22/phase-6-g5-press-hall-runtime-v3-3/product-runtime-v1';
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
const port = Number(process.env.KYX_PRESS_HALL_V33_CAPTURE_PORT ?? 4333);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('KYX_PRESS_HALL_CAPTURE_PORT_INVALID');
}
const origin = `http://${host}:${port}`;
const route = '/?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.3%2Fspatial-material-joined';
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

async function dataUrl(absolutePath) {
  return `data:image/png;base64,${(await readFile(absolutePath)).toString('base64')}`;
}

async function renderFourViewBoard(context, viewPaths, outputPath) {
  const board = await context.newPage();
  await board.setViewportSize({ width: 1_600, height: 900 });
  const panels = [];
  for (const [viewId, absolutePath] of Object.entries(viewPaths)) {
    panels.push(`<section><img src="${await dataUrl(absolutePath)}"><span>${viewId.replaceAll('_', ' ')} · product route · art only</span></section>`);
  }
  await board.setContent(`<!doctype html><style>
    html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#06090b;color:#dff7f3;font:13px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace}
    main{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;width:1600px;height:900px}
    section{position:relative;overflow:hidden;border:1px solid #22373e}img{display:block;width:100%;height:100%;object-fit:cover}
    span{position:absolute;left:10px;top:10px;padding:7px 9px;background:rgba(3,8,10,.84);border:1px solid rgba(159,235,226,.46);text-transform:uppercase;letter-spacing:.05em}
  </style><main>${panels.join('')}</main>`, { waitUntil: 'load' });
  await board.screenshot({ path: outputPath });
  await board.close();
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
  'tools/evidence/capture-phase6-g5-press-hall-runtime-v3-3.mjs',
  'tools/evidence/verify-phase6-g5-press-hall-runtime-v3-3.mjs',
  'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/export/inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb',
  'assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/material-export-v3-3/validation/press-hall-material-export-v3-3-build-report.json',
  'evidence/2026-07-22/phase-6-g5-press-hall-material-export-v3-3/actual-loader-v4/capture.json',
  'evidence/2026-07-22/phase-6-g5-press-hall-material-export-v3-3/actual-loader-v4/verification.json',
  'evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/runtime-v3/capture.json',
  'assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb',
  'assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb',
  'assets/source/maps/inkfall-foundry/runtime/map.package.v2.json',
  'assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json',
  'assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json',
];
const v32RuntimeBaseline = JSON.parse(await readFile(
  path.join(
    repoRoot,
    'evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/runtime-v3/capture.json',
  ),
  'utf8',
));

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

  const artOnlyViewPaths = Object.freeze({
    gameplay: path.join(outputDirectory, 'gameplay-art-only.png'),
    north: path.join(outputDirectory, 'north-art-only.png'),
    south: path.join(outputDirectory, 'south-art-only.png'),
    overhead: path.join(outputDirectory, 'overhead-art-only.png'),
  });
  const gameplayAuthorityPath = path.join(outputDirectory, 'gameplay-authority-overlay.png');
  const overheadAuthorityPath = path.join(outputDirectory, 'overhead-authority-overlay.png');
  for (const [viewId, screenshotPath] of Object.entries(artOnlyViewPaths)) {
    await page.evaluate((view) => {
      window.__KYX_PRESS_HALL_INSPECTION__?.selectView(view);
      window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(false);
    }, viewId);
    await page.waitForTimeout(350);
    await page.screenshot({ path: screenshotPath, fullPage: false });
  }
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.selectView('gameplay'));
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.setAuthorityOverlay(true));
  await page.waitForTimeout(350);
  await page.screenshot({ path: gameplayAuthorityPath, fullPage: false });
  await page.evaluate(() => window.__KYX_PRESS_HALL_INSPECTION__?.selectView('overhead'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: overheadAuthorityPath, fullPage: false });
  const fourViewBoardPath = path.join(outputDirectory, 'product-runtime-art-only-four-view-board.png');
  await renderFourViewBoard(context, artOnlyViewPaths, fourViewBoardPath);

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
  assert(evidence?.status === 'PRESS_HALL_V3_3_RUNTIME_INSPECTION_READY_G5_G8_OPEN', 'route status');
  assert(evidence?.selection?.reference === 'inkfall_foundry@2/press_hall/v3.3/spatial-material-joined', 'selection');
  assert(evidence?.catalogDefault?.mapRevision === 1 && evidence?.catalogDefault?.unchanged === true, 'default preserved');
  assert(evidence?.art?.sha256 === '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564', 'art hash');
  assert(evidence?.art?.bytes === 13_301_752, 'art bytes');
  assert(evidence?.art?.primitiveCount === 29 && evidence?.art?.triangleCount === 188_576, 'art structure');
  assert(evidence?.art?.materialEncoding?.explicitBaseColorFactorCount === 9
    && evidence?.art?.materialEncoding?.baseColorTextureReferenceCount === 0
    && evidence?.art?.materialEncoding?.runtimeColorParityWithBlenderReview === true
    && evidence?.art?.materialEncoding?.instantiatedMaterialCount === 9
    && evidence?.art?.materialEncoding?.whiteFallbackMaterialCount === 0
    && evidence?.art?.materialEncoding?.maximumBaseColorDelta <= 1e-6
    && evidence?.art?.materialEncoding?.maximumMetalnessDelta <= 1e-6
    && evidence?.art?.materialEncoding?.maximumRoughnessDelta <= 1e-6
    && evidence?.art?.materialEncoding?.instantiatedValuesMatchExplicitGltf === true, 'runtime material identity');
  assert(evidence?.authorityAlignment?.fixtureHash === 'bf85e42731fd088e', 'authority fixture');
  assert(evidence?.authorityAlignment?.solidColliderCount === 339, 'authority cardinality');
  assert(evidence?.authorityAlignment?.artGeometryMayBeAuthority === false, 'authority separation');
  assert(evidence?.renderer?.artOnly?.calls > 0 && evidence?.renderer?.artOnly?.calls <= 29, 'actual art calls');
  assert(evidence?.renderer?.artOnly?.triangles > 0 && evidence?.renderer?.artOnly?.triangles <= 188_576, 'actual art triangles');
  assert(evidence?.renderer?.artPlusAuthorityOverlay?.calls > evidence?.renderer?.artOnly?.calls, 'overlay calls');
  assert(evidence?.performance?.frameTimes?.count === 180, 'frame profile count');
  const v32Evidence = v32RuntimeBaseline.routeSnapshot.evidence;
  const performanceComparisonVsV32 = Object.freeze({
    binding: Object.freeze({
      baselineStatus: v32RuntimeBaseline.status,
      baselineBrowserVersion: v32RuntimeBaseline.browser.version,
      baselineHost: v32RuntimeBaseline.host.machineName,
      sameGeometry: evidence.art.nodeCount === v32Evidence.art.nodeCount
        && evidence.art.primitiveCount === v32Evidence.art.primitiveCount
        && evidence.art.triangleCount === v32Evidence.art.triangleCount,
      payloadDeltaBytes: evidence.art.bytes - v32Evidence.art.bytes,
      artOnlyCallsDelta: evidence.renderer.artOnly.calls - v32Evidence.renderer.artOnly.calls,
      artOnlyTrianglesDelta: evidence.renderer.artOnly.triangles - v32Evidence.renderer.artOnly.triangles,
    }),
    baselineFrameTimes: v32Evidence.performance.frameTimes,
    candidateFrameTimes: evidence.performance.frameTimes,
    ratios: Object.freeze({
      p50: evidence.performance.frameTimes.p50Ms / v32Evidence.performance.frameTimes.p50Ms,
      p95: evidence.performance.frameTimes.p95Ms / v32Evidence.performance.frameTimes.p95Ms,
      mean: evidence.performance.frameTimes.meanMs / v32Evidence.performance.frameTimes.meanMs,
    }),
    driftBudget: Object.freeze({
      maximumP50Ratio: 1.5,
      maximumP95Ratio: 1.5,
      geometryOrDrawCallGrowthAllowed: false,
    }),
  });
  assert(performanceComparisonVsV32.binding.sameGeometry, 'v3.2 geometry parity');
  assert(performanceComparisonVsV32.binding.artOnlyCallsDelta === 0
    && performanceComparisonVsV32.binding.artOnlyTrianglesDelta === 0, 'renderer structural drift');
  assert(performanceComparisonVsV32.ratios.p50 <= performanceComparisonVsV32.driftBudget.maximumP50Ratio
    && performanceComparisonVsV32.ratios.p95 <= performanceComparisonVsV32.driftBudget.maximumP95Ratio, 'software renderer frame drift');
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
    gameplayArtOnly: artOnlyViewPaths.gameplay,
    northArtOnly: artOnlyViewPaths.north,
    southArtOnly: artOnlyViewPaths.south,
    overheadArtOnly: artOnlyViewPaths.overhead,
    gameplayAuthorityOverlay: gameplayAuthorityPath,
    overheadAuthorityOverlay: overheadAuthorityPath,
    productRuntimeArtOnlyFourViewBoard: fourViewBoardPath,
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
    status: 'PRESS_HALL_V3_3_BOUNDED_PRODUCT_RUNTIME_CAPTURE_PASS_G5_G8_OPEN',
    capturedAt: new Date().toISOString(),
    scope: 'G5_G8_NON_DEFAULT_PRESS_HALL_V3_3_PRODUCT_RUNTIME_INSPECTION',
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
    performanceComparisonVsV32,
    sources,
    assessment: {
      boundedRuntimeIntegration: 'PASS',
      exactArtHashAndThreeLoader: 'PASS',
      separateRevision2AuthorityOverlay: 'PASS',
      actualRendererProfile: 'PASS',
      runtimeMaterialEncoding: 'PASS_EXACT_GLTF_FACTORS_ZERO_WHITE_FALLBACKS',
      performanceStructuralDriftVsV32: 'PASS_NO_GEOMETRY_OR_DRAW_CALL_GROWTH_P50_P95_WITHIN_1_5X',
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
    performanceComparisonVsV32,
    loadTimingMs: evidence.performance.loadTimingMs,
    screenshots,
  }, null, 2)}\n`);
} finally {
  await cdp?.detach().catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.exitCode === null) server.kill();
}
