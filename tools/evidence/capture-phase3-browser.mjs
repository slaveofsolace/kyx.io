import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const FIXTURE_TAPE_ID = 'flat_run_fixed_20hz_v1';
const FIXTURE_ROUTE = '__test__/movement';
const DRIVER_QUERY = 'movementDriver=flat_run';
const DRIVER_PROPERTY = '__KYX_DEV_FLAT_RUN_MOVEMENT__';
const DRIVER_MODULE_FRAGMENT = '/src/dev/developmentFlatRunMovementDriver.ts';
const DRIVER_MARKER = 'HYPOTHESIS · FLAT_RUN · DEV ONLY';
const DRIVER_DISCLOSURE = 'MOVEMENT FIXTURE · COMBAT / AI / PICKUPS / MODE TIMER PAUSED';
const EVIDENCE_OVERLAY_ID = 'phase3-evidence-capture-overlay';
const EVIDENCE_OVERLAY_TEXT = [
  'AUTOMATED EVIDENCE CAPTURE ONLY',
  'G2 OPEN · PENDING HUMAN REVIEW',
  'NO VISUAL APPROVAL CLAIMED',
].join('\n');

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  const result = new URL(value);
  if (!['http:', 'https:'].includes(result.protocol)) {
    throw new Error('--base-url must use http or https');
  }
  if (result.username || result.password) {
    throw new Error('--base-url must not contain credentials');
  }
  result.hash = '';
  result.search = '';
  if (!result.pathname.endsWith('/')) result.pathname += '/';
  return result;
}

function serializeError(error) {
  return {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function jsonSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonSha256(value) {
  return sha256(JSON.stringify(value));
}

function progress(step) {
  process.stderr.write(`[phase3-browser] ${new Date().toISOString()} ${step}\n`);
}

async function exists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function fingerprintFile(targetPath) {
  const bytes = await readFile(targetPath);
  return {
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function installedPackageVersion(packageName) {
  const packagePath = path.join(repositoryRoot, 'node_modules', packageName, 'package.json');
  const manifest = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`Installed ${packageName} package does not expose a version`);
  }
  return manifest.version;
}

const baseUrl = normalizeBaseUrl(option('base-url', 'http://127.0.0.1:5999/'));
const outputDirectory = path.resolve(
  repositoryRoot,
  option(
    'output-dir',
    'evidence/2026-07-20/phase-3-movement-collision/browser',
  ),
);
const nodeEvidencePath = path.resolve(
  repositoryRoot,
  option(
    'node-evidence',
    'evidence/2026-07-20/phase-3-movement-collision/movement-tapes.json',
  ),
);
const allowOverwrite = flag('allow-overwrite');
const width = positiveInteger('width', 1600);
const height = positiveInteger('height', 900);
const timeoutMs = positiveInteger('timeout-ms', 30_000);
const screenshotsDirectory = path.join(outputDirectory, 'screenshots');
const videosDirectory = path.join(outputDirectory, 'videos');
const summaryPath = path.join(outputDirectory, 'phase3-browser-summary.json');

const screenshotTargets = Object.freeze({
  fixtureLab: path.join(screenshotsDirectory, 'phase3-fixture-lab.png'),
  driverReady: path.join(screenshotsDirectory, 'phase3-driver-ready.png'),
  driverRun: path.join(screenshotsDirectory, 'phase3-driver-run.png'),
  driverJump: path.join(screenshotsDirectory, 'phase3-driver-jump.png'),
  driverSlide: path.join(screenshotsDirectory, 'phase3-driver-slide.png'),
  driverTeleport: path.join(screenshotsDirectory, 'phase3-driver-teleport.png'),
  failure: path.join(screenshotsDirectory, 'phase3-browser-failure.png'),
});

const collisions = [];
for (const targetPath of [summaryPath, ...Object.values(screenshotTargets)]) {
  if (await exists(targetPath)) collisions.push(targetPath);
}
if (collisions.length > 0 && !allowOverwrite) {
  throw new Error(
    `PHASE3_BROWSER_OUTPUT_EXISTS: refusing to overwrite ${collisions.join(', ')}; pass --allow-overwrite to replace these capture targets`,
  );
}

await mkdir(screenshotsDirectory, { recursive: true });
await mkdir(videosDirectory, { recursive: true });

const startedAt = Date.now();
const summary = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  evidenceLabel: 'HYPOTHESIS',
  productStatus: 'NON_PRODUCT_FIXTURE_EVIDENCE',
  artifactScope: 'PHASE3_BROWSER_CAPTURE_ONLY',
  g2Status: 'OPEN',
  humanReviewStatus: 'PENDING_HUMAN_REVIEW',
  visualApproval: 'NOT_PERFORMED_OR_CLAIMED',
  baseUrl: baseUrl.href,
  outputDirectory,
  nodeEvidence: null,
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    playwright: null,
    chromium: null,
    userAgent: null,
    userAgentData: null,
  },
  viewport: { width, height, deviceScaleFactor: 1 },
  requirements: {
    fixtureTapeId: FIXTURE_TAPE_ID,
    fixtureRoute: new URL(FIXTURE_ROUTE, baseUrl).href,
    exactDevelopmentDriverUrl: new URL(`?${DRIVER_QUERY}`, baseUrl).href,
    evidenceOverlayText: EVIDENCE_OVERLAY_TEXT,
    network: 'No console/page/request/HTTP failures, no external HTTP requests, and no application WebSockets. Same-origin Vite HMR is the only permitted WebSocket.',
    media: 'Fresh Chromium video and stage screenshots are automated review inputs, not visual approval.',
  },
  checks: [],
  failures: [],
  fixtureLab: {
    payload: null,
    reloadPayloadSha256: null,
    immutability: null,
    reloadImmutability: null,
    overlay: null,
    parity: null,
    errors: [],
  },
  driver: {
    exactUrl: new URL(`?${DRIVER_QUERY}`, baseUrl).href,
    marker: DRIVER_MARKER,
    disclosure: DRIVER_DISCLOSURE,
    overlay: null,
    diagnosticsSnapshots: [],
    actions: {},
    errors: [],
  },
  network: null,
  screenshots: [],
  videos: [],
  errors: [],
  ok: false,
};

function check(id, passed, details = {}) {
  const record = { id, passed: Boolean(passed), details };
  summary.checks.push(record);
  if (!record.passed) summary.failures.push(record);
  return record.passed;
}

function requireCheck(id, passed, details = {}) {
  if (!check(id, passed, details)) {
    throw new Error(`PHASE3_BROWSER_REQUIRED_CHECK_FAILED:${id}`);
  }
}

function monitorPage(page) {
  const requestRecords = new Map();
  const webSockets = [];
  const consoleEntries = [];
  const pageErrors = [];

  page.on('request', (request) => {
    requestRecords.set(request, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
      failure: null,
    });
  });
  page.on('response', (response) => {
    const request = response.request();
    const record = requestRecords.get(request) ?? {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: null,
    };
    record.status = response.status();
    requestRecords.set(request, record);
  });
  page.on('requestfailed', (request) => {
    const record = requestRecords.get(request) ?? {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
    };
    record.failure = request.failure()?.errorText ?? 'unknown request failure';
    requestRecords.set(request, record);
  });
  page.on('websocket', (socket) => {
    const record = {
      url: socket.url(),
      framesSent: 0,
      framesReceived: 0,
      closed: false,
      socketErrors: [],
    };
    webSockets.push(record);
    socket.on('framesent', () => { record.framesSent += 1; });
    socket.on('framereceived', () => { record.framesReceived += 1; });
    socket.on('close', () => { record.closed = true; });
    socket.on('socketerror', (error) => { record.socketErrors.push(String(error)); });
  });
  page.on('console', (message) => {
    consoleEntries.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });
  page.on('pageerror', (error) => pageErrors.push(serializeError(error)));

  return {
    snapshot() {
      const requests = [...requestRecords.values()];
      const httpRequests = requests.filter((record) => {
        try {
          return ['http:', 'https:'].includes(new URL(record.url).protocol);
        } catch {
          return false;
        }
      });
      const externalRequests = httpRequests.filter(
        (record) => new URL(record.url).origin !== baseUrl.origin,
      );
      const httpErrors = httpRequests.filter(
        (record) => Number.isInteger(record.status) && record.status >= 400,
      );
      const failedRequests = requests.filter((record) => record.failure !== null);
      const viteClientRequested = httpRequests.some((record) => {
        try {
          return new URL(record.url).pathname.endsWith('/@vite/client');
        } catch {
          return false;
        }
      });
      const expectedSocketProtocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const viteWebSockets = webSockets.filter((record) => {
        if (!viteClientRequested) return false;
        try {
          const socketUrl = new URL(record.url);
          return socketUrl.protocol === expectedSocketProtocol
            && socketUrl.host === baseUrl.host
            && (socketUrl.pathname === '/' || socketUrl.pathname === baseUrl.pathname)
            && socketUrl.searchParams.has('token');
        } catch {
          return false;
        }
      });
      const viteSocketSet = new Set(viteWebSockets);
      const applicationWebSockets = webSockets.filter((record) => !viteSocketSet.has(record));
      return {
        requests,
        requestCount: requests.length,
        origins: [...new Set(httpRequests.map((record) => new URL(record.url).origin))].sort(),
        externalRequests,
        httpErrors,
        failedRequests,
        viteClientRequested,
        webSockets,
        viteWebSockets,
        applicationWebSockets,
        consoleEntries,
        consoleErrors: consoleEntries.filter((entry) => entry.type === 'error'),
        pageErrors,
      };
    },
  };
}

function finalizeNetwork(monitor) {
  if (monitor === null) return;
  const network = monitor.snapshot();
  summary.network = network;
  check('network.vite_client_loaded', network.viteClientRequested, {
    viteClientRequested: network.viteClientRequested,
  });
  check('network.no_console_errors', network.consoleErrors.length === 0, {
    consoleErrors: network.consoleErrors,
  });
  check('network.no_page_errors', network.pageErrors.length === 0, {
    pageErrors: network.pageErrors,
  });
  check('network.no_request_failures', network.failedRequests.length === 0, {
    failedRequests: network.failedRequests,
  });
  check('network.no_http_errors', network.httpErrors.length === 0, {
    httpErrors: network.httpErrors,
  });
  check('network.no_external_requests', network.externalRequests.length === 0, {
    expectedOrigin: baseUrl.origin,
    externalRequests: network.externalRequests,
  });
  check('network.no_application_websockets', network.applicationWebSockets.length === 0, {
    applicationWebSockets: network.applicationWebSockets,
    viteWebSockets: network.viteWebSockets,
  });
  check('network.no_websocket_errors', network.webSockets.every(
    (socket) => socket.socketErrors.length === 0,
  ), {
    socketsWithErrors: network.webSockets.filter((socket) => socket.socketErrors.length > 0),
  });
}

async function injectEvidenceOverlay(page, surface) {
  return page.evaluate(({ id, text, captureSurface }) => {
    document.getElementById(id)?.remove();
    const overlay = document.createElement('aside');
    overlay.id = id;
    overlay.dataset.captureSurface = captureSurface;
    overlay.setAttribute('role', 'note');
    overlay.setAttribute('aria-label', 'Automated Phase 3 evidence capture status');
    overlay.textContent = text;
    overlay.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      'right:14px',
      'bottom:14px',
      'max-width:430px',
      'padding:12px 14px',
      'border:2px solid #46d9c5',
      'background:rgba(4,18,24,.96)',
      'color:#b7fff4',
      'font:900 12px/1.45 ui-monospace,monospace',
      'letter-spacing:.09em',
      'pointer-events:none',
      'text-transform:uppercase',
      'white-space:pre-line',
      'box-shadow:0 0 28px rgba(70,217,197,.25)',
    ].join(';');
    document.body.append(overlay);
    const style = getComputedStyle(overlay);
    const rectangle = overlay.getBoundingClientRect();
    return {
      id: overlay.id,
      text: overlay.textContent,
      surface: overlay.dataset.captureSurface,
      visible: style.display !== 'none'
        && style.visibility !== 'hidden'
        && rectangle.width > 0
        && rectangle.height > 0,
      rectangle: {
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
      },
    };
  }, { id: EVIDENCE_OVERLAY_ID, text: EVIDENCE_OVERLAY_TEXT, captureSurface: surface });
}

async function captureScreenshot(page, id, targetPath, options = {}) {
  await page.screenshot({
    path: targetPath,
    animations: 'disabled',
    fullPage: options.fullPage ?? false,
    timeout: timeoutMs,
  });
  const fingerprint = await fingerprintFile(targetPath);
  const record = {
    id,
    path: path.relative(outputDirectory, targetPath).replaceAll('\\', '/'),
    capturedAt: new Date().toISOString(),
    ...fingerprint,
  };
  summary.screenshots.push(record);
  check(`artifact.screenshot.${id}`, fingerprint.bytes > 0, record);
  return record;
}

async function readFixtureSurface(page) {
  return page.evaluate(() => {
    const recursivelyFrozen = (root) => {
      const pending = [root];
      const seen = new Set();
      while (pending.length > 0) {
        const value = pending.pop();
        if (value === null || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (!Object.isFrozen(value)) return false;
        pending.push(...Object.values(value));
      }
      return true;
    };
    const payload = window.__KYX_MOVEMENT_LAB_RESULT__;
    const descriptor = Object.getOwnPropertyDescriptor(window, '__KYX_MOVEMENT_LAB_RESULT__');
    const serialized = document.getElementById('movement-result')?.textContent ?? null;
    if (payload === undefined || serialized === null) {
      throw new Error('MOVEMENT_FIXTURE_LAB_PAYLOAD_UNAVAILABLE');
    }
    return {
      payload: JSON.parse(JSON.stringify(payload)),
      domPayload: JSON.parse(serialized),
      immutability: {
        graphFrozen: recursivelyFrozen(payload),
        writable: descriptor?.writable,
        configurable: descriptor?.configurable,
        enumerable: descriptor?.enumerable,
      },
      route: {
        title: document.title,
        url: location.href,
        launchSupport: document.body.dataset.launchSupport ?? null,
        movementStatus: document.body.dataset.movementStatus ?? null,
        movementHash: document.body.dataset.movementHash ?? null,
        gameCanvasCount: document.querySelectorAll('#game-canvas').length,
        startButtonCount: [...document.querySelectorAll('button')].filter(
          (button) => button.textContent?.trim() === 'START OFFLINE PRACTICE',
        ).length,
      },
    };
  });
}

async function loadNodeEvidence() {
  const bytes = await readFile(nodeEvidencePath);
  const evidence = JSON.parse(bytes.toString('utf8'));
  requireCheck('node_evidence.ok', evidence?.ok === true, {
    actual: evidence?.ok ?? null,
    errors: evidence?.errors ?? null,
  });
  const tape = Array.isArray(evidence?.tapes)
    ? evidence.tapes.find((entry) => entry?.id === FIXTURE_TAPE_ID)
    : null;
  requireCheck('node_evidence.canonical_tape_present', tape !== null && tape !== undefined, {
    tapeId: FIXTURE_TAPE_ID,
    availableTapeIds: Array.isArray(evidence?.tapes)
      ? evidence.tapes.map((entry) => entry?.id ?? null)
      : null,
  });
  requireCheck('node_evidence.canonical_tape_exact', (
    tape.repeatConfirmed === true
    && tape.recordedMatch === true
    && tape.firstFinalHash === tape.secondFinalHash
    && tape.firstFinalHash === tape.recordedFinalHash
    && tape.identity !== null
    && typeof tape.identity === 'object'
    && tape.result?.envelope !== null
    && typeof tape.result?.envelope === 'object'
  ), {
    repeatConfirmed: tape.repeatConfirmed,
    recordedMatch: tape.recordedMatch,
    firstFinalHash: tape.firstFinalHash,
    secondFinalHash: tape.secondFinalHash,
    recordedFinalHash: tape.recordedFinalHash,
  });
  summary.nodeEvidence = {
    path: path.relative(repositoryRoot, nodeEvidencePath).replaceAll('\\', '/'),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    capturedAt: evidence.capturedAt ?? null,
    completedAt: evidence.completedAt ?? null,
    artifactScope: evidence.artifactScope ?? null,
    ok: evidence.ok,
    canonicalTape: jsonSnapshot(tape),
  };
  return tape;
}

async function runFixtureLab(page, nodeTape) {
  progress('fixture lab: loading Chromium tape payload');
  try {
    const fixtureUrl = new URL(FIXTURE_ROUTE, baseUrl).href;
    const response = await page.goto(fixtureUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    check('fixture_lab.document_ok', Boolean(response?.ok()), {
      requestedUrl: fixtureUrl,
      finalUrl: page.url(),
      status: response?.status() ?? null,
    });
    await page.locator('body[data-movement-status="pass"]').waitFor({
      state: 'attached',
      timeout: timeoutMs,
    });

    const first = await readFixtureSurface(page);
    summary.fixtureLab.payload = first.payload;
    summary.fixtureLab.immutability = first.immutability;
    check('fixture_lab.route_boundary', (
      first.route.title === 'KYX.IO - Movement Fixture Lab'
      && first.route.launchSupport === 'movement-fixture-lab'
      && first.route.movementStatus === 'pass'
      && first.route.gameCanvasCount === 0
      && first.route.startButtonCount === 0
    ), first.route);
    check('fixture_lab.payload_immutable', (
      first.immutability.graphFrozen === true
      && first.immutability.writable === false
      && first.immutability.configurable === false
      && first.immutability.enumerable === false
      && sameJson(first.payload, first.domPayload)
    ), {
      ...first.immutability,
      domMatchesGlobal: sameJson(first.payload, first.domPayload),
    });
    check('fixture_lab.truthful_scope', (
      first.payload?.evidence?.label === 'HYPOTHESIS'
      && first.payload?.evidence?.surface === 'FIXTURE LAB'
      && first.payload?.evidence?.productStatus === 'NON_PRODUCT'
      && first.payload?.evidence?.route === '/__test__/movement'
    ), { evidence: first.payload?.evidence ?? null });

    const parity = {
      node: {
        finalHash: nodeTape.firstFinalHash,
        identity: jsonSnapshot(nodeTape.identity),
        envelope: jsonSnapshot(nodeTape.result.envelope),
      },
      chromium: {
        firstFinalHash: first.payload?.hash?.firstRun ?? null,
        secondFinalHash: first.payload?.hash?.secondRun ?? null,
        recordedFinalHash: first.payload?.hash?.recorded ?? null,
        identity: jsonSnapshot(first.payload?.identity ?? null),
        envelope: jsonSnapshot(first.payload?.envelope ?? null),
      },
      recorded: {
        finalHash: nodeTape.recordedFinalHash,
        identity: jsonSnapshot(nodeTape.identity),
        envelope: jsonSnapshot(nodeTape.result.envelope),
      },
    };
    parity.hashMatch = (
      parity.node.finalHash === nodeTape.secondFinalHash
      && parity.node.finalHash === parity.recorded.finalHash
      && parity.node.finalHash === parity.chromium.firstFinalHash
      && parity.node.finalHash === parity.chromium.secondFinalHash
      && parity.node.finalHash === parity.chromium.recordedFinalHash
      && first.payload?.hash?.repeatConfirmed === true
      && first.payload?.hash?.recordedMatch === true
    );
    parity.identityMatch = sameJson(parity.node.identity, parity.chromium.identity)
      && sameJson(parity.node.identity, parity.recorded.identity);
    parity.envelopeMatch = sameJson(parity.node.envelope, parity.chromium.envelope)
      && sameJson(parity.node.envelope, parity.recorded.envelope);
    parity.measurementsMatch = sameJson(
      nodeTape.result.measurements,
      first.payload?.measurements,
    );
    parity.queryMetricsMatch = sameJson(
      nodeTape.result.envelope.queries,
      first.payload?.queryMetrics,
    );
    parity.tapeMetadataMatch = (
      first.payload?.tape?.id === nodeTape.id
      && first.payload?.tape?.schemaVersion === nodeTape.schemaVersion
      && first.payload?.tape?.simulationRateHz === nodeTape.simulationRateHz
      && first.payload?.tape?.frameCount === nodeTape.frameCount
    );
    summary.fixtureLab.parity = parity;
    check('fixture_lab.node_chromium_recorded_hash_parity', parity.hashMatch, parity);
    check('fixture_lab.node_chromium_recorded_identity_parity', parity.identityMatch, parity);
    check('fixture_lab.node_chromium_recorded_envelope_parity', parity.envelopeMatch, parity);
    check('fixture_lab.measurements_parity', parity.measurementsMatch, {
      node: nodeTape.result.measurements,
      chromium: first.payload?.measurements ?? null,
    });
    check('fixture_lab.query_metrics_parity', parity.queryMetricsMatch, {
      node: nodeTape.result.envelope.queries,
      chromium: first.payload?.queryMetrics ?? null,
    });
    check('fixture_lab.tape_metadata_parity', parity.tapeMetadataMatch, {
      node: {
        id: nodeTape.id,
        schemaVersion: nodeTape.schemaVersion,
        simulationRateHz: nodeTape.simulationRateHz,
        frameCount: nodeTape.frameCount,
      },
      chromium: first.payload?.tape ?? null,
    });

    summary.fixtureLab.overlay = await injectEvidenceOverlay(page, 'fixture-lab');
    check('fixture_lab.evidence_overlay_visible', (
      summary.fixtureLab.overlay.visible
      && summary.fixtureLab.overlay.text === EVIDENCE_OVERLAY_TEXT
    ), summary.fixtureLab.overlay);
    await captureScreenshot(
      page,
      'fixture_lab',
      screenshotTargets.fixtureLab,
      { fullPage: true },
    );

    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.locator('body[data-movement-status="pass"]').waitFor({
      state: 'attached',
      timeout: timeoutMs,
    });
    const reload = await readFixtureSurface(page);
    summary.fixtureLab.reloadPayloadSha256 = jsonSha256(reload.payload);
    summary.fixtureLab.reloadImmutability = reload.immutability;
    check('fixture_lab.reload_payload_exact', sameJson(first.payload, reload.payload), {
      firstSha256: jsonSha256(first.payload),
      reloadSha256: jsonSha256(reload.payload),
    });
    check('fixture_lab.reload_payload_immutable', (
      reload.immutability.graphFrozen === true
      && reload.immutability.writable === false
      && reload.immutability.configurable === false
      && reload.immutability.enumerable === false
      && sameJson(reload.payload, reload.domPayload)
    ), {
      ...reload.immutability,
      domMatchesGlobal: sameJson(reload.payload, reload.domPayload),
    });
    check('fixture_lab.completed', true);
  } catch (error) {
    const serialized = serializeError(error);
    summary.fixtureLab.errors.push(serialized);
    check('fixture_lab.completed', false, { error: serialized });
  }
}

async function readDiagnosticsSurface(page, stage) {
  const surface = await page.evaluate(({ property }) => {
    const canvas = document.querySelector('#game-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('DEVELOPMENT_DRIVER_CANVAS_UNAVAILABLE');
    }
    const diagnostics = canvas[property];
    if (diagnostics === undefined) {
      throw new Error('DEVELOPMENT_DRIVER_DIAGNOSTICS_UNAVAILABLE');
    }
    const recursivelyFrozen = (root) => {
      const pending = [root];
      const seen = new Set();
      while (pending.length > 0) {
        const value = pending.pop();
        if (value === null || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (!Object.isFrozen(value)) return false;
        pending.push(...Object.values(value));
      }
      return true;
    };
    const canvasDescriptor = Object.getOwnPropertyDescriptor(canvas, property);
    const bodyDescriptor = Object.getOwnPropertyDescriptor(document.body, property);
    const serialized = JSON.stringify(diagnostics);
    return {
      value: JSON.parse(serialized),
      invariants: {
        canvasGetter: typeof canvasDescriptor?.get === 'function',
        canvasSetterAbsent: canvasDescriptor?.set === undefined,
        canvasEnumerable: canvasDescriptor?.enumerable,
        canvasConfigurable: canvasDescriptor?.configurable,
        bodyGetter: typeof bodyDescriptor?.get === 'function',
        bodySetterAbsent: bodyDescriptor?.set === undefined,
        bodyEnumerable: bodyDescriptor?.enumerable,
        bodyConfigurable: bodyDescriptor?.configurable,
        sameSnapshot: diagnostics === document.body[property],
        recursivelyFrozen: recursivelyFrozen(diagnostics),
        canvasSerializedMatches: canvas.getAttribute('data-kyx-dev-movement') === serialized,
        bodySerializedMatches:
          document.body.getAttribute('data-kyx-dev-movement') === serialized,
        gameGlobalAbsent: !Object.hasOwn(window, 'game'),
      },
    };
  }, { property: DRIVER_PROPERTY });
  const record = {
    stage,
    capturedAt: new Date().toISOString(),
    sha256: jsonSha256(surface.value),
    ...surface,
  };
  summary.driver.diagnosticsSnapshots.push(record);
  check(`driver.diagnostics.${stage}.immutable`, (
    surface.invariants.canvasGetter
    && surface.invariants.canvasSetterAbsent
    && surface.invariants.canvasEnumerable === false
    && surface.invariants.canvasConfigurable === true
    && surface.invariants.bodyGetter
    && surface.invariants.bodySetterAbsent
    && surface.invariants.bodyEnumerable === false
    && surface.invariants.bodyConfigurable === true
    && surface.invariants.sameSnapshot
    && surface.invariants.recursivelyFrozen
    && surface.invariants.canvasSerializedMatches
    && surface.invariants.bodySerializedMatches
    && surface.invariants.gameGlobalAbsent
  ), surface.invariants);
  check(`driver.diagnostics.${stage}.truthful_boundary`, (
    surface.value.schemaVersion === 1
    && surface.value.label === DRIVER_MARKER
    && surface.value.productStatus === 'NON_PRODUCT_FIXTURE_AUTHORITY'
    && surface.value.coordinateAdapter === 'threejs_reflect_x_v1'
    && surface.value.worldDisposed === false
    && surface.value.authorityRateHz === 20
    && surface.value.error === null
  ), {
    schemaVersion: surface.value.schemaVersion,
    label: surface.value.label,
    productStatus: surface.value.productStatus,
    coordinateAdapter: surface.value.coordinateAdapter,
    worldDisposed: surface.value.worldDisposed,
    authorityRateHz: surface.value.authorityRateHz,
    error: surface.value.error,
  });
  return record;
}

async function dispatchKeyEdge(page, code) {
  await page.evaluate((keyCode) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: keyCode }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: keyCode }));
  }, code);
}

async function runDevelopmentDriver(page, monitor, nodeTape) {
  progress('development driver: loading exact flat_run DEV boundary');
  try {
    const driverUrl = new URL(`?${DRIVER_QUERY}`, baseUrl).href;
    const response = await page.goto(driverUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    check('driver.document_ok', Boolean(response?.ok()), {
      requestedUrl: driverUrl,
      finalUrl: page.url(),
      status: response?.status() ?? null,
    });
    const marker = page.locator('#dev-flat-run-movement-marker');
    await marker.waitFor({ state: 'visible', timeout: timeoutMs });
    const startButton = page.getByRole('button', { name: 'START OFFLINE PRACTICE', exact: true });
    await startButton.waitFor({ state: 'visible', timeout: timeoutMs });
    await page.waitForFunction(({ property }) => {
      const canvas = document.querySelector('#game-canvas');
      return canvas?.[property]?.status === 'ready';
    }, { property: DRIVER_PROPERTY }, { timeout: timeoutMs, polling: 50 });
    const startSurface = await page.evaluate(({ markerId }) => {
      const markerElement = document.getElementById(markerId);
      const rectangle = markerElement?.getBoundingClientRect();
      return {
        url: location.href,
        origin: location.origin,
        pathname: location.pathname,
        search: location.search,
        bodyDriver: document.body.dataset.movementDriver ?? null,
        markerText: markerElement?.textContent ?? null,
        markerVisible: Boolean(
          markerElement
          && rectangle
          && rectangle.width > 0
          && rectangle.height > 0
          && getComputedStyle(markerElement).visibility !== 'hidden'
        ),
      };
    }, { markerId: 'dev-flat-run-movement-marker' });
    const moduleRequested = monitor.snapshot().requests.some(
      (request) => request.url.includes(DRIVER_MODULE_FRAGMENT),
    );
    check('driver.exact_dev_start', (
      startSurface.url === driverUrl
      && startSurface.origin === baseUrl.origin
      && startSurface.pathname === baseUrl.pathname
      && startSurface.search === `?${DRIVER_QUERY}`
      && startSurface.bodyDriver === 'flat_run'
      && startSurface.markerText === `${DRIVER_MARKER}\n${DRIVER_DISCLOSURE}`
      && startSurface.markerVisible
      && moduleRequested
    ), { ...startSurface, expectedUrl: driverUrl, moduleRequested });

    summary.driver.overlay = await injectEvidenceOverlay(page, 'development-driver');
    check('driver.evidence_overlay_visible', (
      summary.driver.overlay.visible
      && summary.driver.overlay.text === EVIDENCE_OVERLAY_TEXT
    ), summary.driver.overlay);

    const ready = await readDiagnosticsSurface(page, 'ready');
    check('driver.fixture_identity', (
      ready.value.fixture?.id === nodeTape.identity.fixtureId
      && ready.value.fixture?.hash === nodeTape.identity.fixtureHash
      && ready.value.fixture?.physicsAdapterVersion
        === nodeTape.identity.physicsAdapterVersion
    ), {
      diagnosticsFixture: ready.value.fixture,
      nodeIdentity: nodeTape.identity,
    });
    await captureScreenshot(page, 'driver_ready', screenshotTargets.driverReady);

    await startButton.click();
    await page.waitForFunction(({ property }) => {
      const canvas = document.querySelector('#game-canvas');
      return canvas?.[property]?.status === 'running';
    }, { property: DRIVER_PROPERTY }, { timeout: timeoutMs, polling: 50 });
    const started = await readDiagnosticsSurface(page, 'started');
    check('driver.started', started.value.status === 'running', {
      status: started.value.status,
    });

    const runStart = started.value;
    await page.keyboard.down('w');
    try {
      await page.waitForFunction(({ property, startTick, startPosition }) => {
        const canvas = document.querySelector('#game-canvas');
        const current = canvas?.[property];
        if (!current) return false;
        const distance = Math.hypot(
          current.authority.feetPositionMm.x - startPosition.x,
          current.authority.feetPositionMm.z - startPosition.z,
        );
        return current.authority.tick >= startTick + 4 && distance >= 300;
      }, {
        property: DRIVER_PROPERTY,
        startTick: runStart.authority.tick,
        startPosition: runStart.authority.feetPositionMm,
      }, { timeout: timeoutMs, polling: 50 });
      const run = await readDiagnosticsSurface(page, 'run');
      const authorityDistanceMm = Math.hypot(
        run.value.authority.feetPositionMm.x - runStart.authority.feetPositionMm.x,
        run.value.authority.feetPositionMm.z - runStart.authority.feetPositionMm.z,
      );
      const renderDistance = Math.hypot(
        run.value.render.position.x - runStart.render.position.x,
        run.value.render.position.z - runStart.render.position.z,
      );
      summary.driver.actions.run = {
        startTick: runStart.authority.tick,
        finalTick: run.value.authority.tick,
        authorityDistanceMm,
        renderDistance,
      };
      check('driver.action.run', (
        run.value.authority.tick > runStart.authority.tick
        && authorityDistanceMm >= 300
        && renderDistance > 0
      ), summary.driver.actions.run);
    } finally {
      await page.keyboard.up('w').catch(() => {});
    }
    await captureScreenshot(page, 'driver_run', screenshotTargets.driverRun);

    const beforeJump = await readDiagnosticsSurface(page, 'before_jump');
    check('driver.before_jump_grounded', beforeJump.value.authority.grounded === true, {
      grounded: beforeJump.value.authority.grounded,
      locomotion: beforeJump.value.authority.locomotion,
    });
    const jumpedBefore = beforeJump.value.sample.semanticEventCounts.jumped ?? 0;
    const landedBefore = beforeJump.value.sample.semanticEventCounts.landed ?? 0;
    await dispatchKeyEdge(page, 'Space');
    await page.waitForFunction(({ property, eventCount }) => {
      const canvas = document.querySelector('#game-canvas');
      const current = canvas?.[property];
      return current
        && (current.sample.semanticEventCounts.jumped ?? 0) > eventCount
        && current.authority.grounded === false;
    }, { property: DRIVER_PROPERTY, eventCount: jumpedBefore }, {
      timeout: timeoutMs,
      polling: 50,
    });
    const jump = await readDiagnosticsSurface(page, 'jump');
    summary.driver.actions.jump = {
      previousCount: jumpedBefore,
      currentCount: jump.value.sample.semanticEventCounts.jumped ?? 0,
      grounded: jump.value.authority.grounded,
      locomotion: jump.value.authority.locomotion,
    };
    check('driver.action.jump', (
      summary.driver.actions.jump.currentCount === jumpedBefore + 1
      && jump.value.authority.grounded === false
    ), summary.driver.actions.jump);
    await captureScreenshot(page, 'driver_jump', screenshotTargets.driverJump);
    await page.waitForFunction(({ property, eventCount }) => {
      const canvas = document.querySelector('#game-canvas');
      const current = canvas?.[property];
      return current
        && (current.sample.semanticEventCounts.landed ?? 0) > eventCount
        && current.authority.grounded === true;
    }, { property: DRIVER_PROPERTY, eventCount: landedBefore }, {
      timeout: timeoutMs,
      polling: 50,
    });

    const beforeSlide = await readDiagnosticsSurface(page, 'before_slide');
    const slidesBefore = beforeSlide.value.sample.semanticEventCounts.slide_started ?? 0;
    const releaseSlideDriveInputs = () => page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'ShiftLeft',
        key: 'Shift',
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    });
    const releaseSlideInputs = () => page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'ControlLeft',
        key: 'Control',
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'ShiftLeft',
        key: 'Shift',
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
    });
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
    });
    try {
      await page.waitForFunction((property) => {
        const canvas = document.querySelector('#game-canvas');
        const current = canvas?.[property];
        return current
          && current.authority.grounded === true
          && Math.hypot(
            current.authority.velocityMmPerSecond.x,
            current.authority.velocityMmPerSecond.z,
          ) >= 7_000;
      }, DRIVER_PROPERTY, { timeout: timeoutMs, polling: 'raf' });
      const slideObservation = page.waitForFunction(({ property, eventCount }) => {
        const canvas = document.querySelector('#game-canvas');
        const current = canvas?.[property];
        return current
          && current.authority.locomotion === 'sliding'
          && (current.sample.semanticEventCounts.slide_started ?? 0) === eventCount + 1
          ? current
          : false;
      }, { property: DRIVER_PROPERTY, eventCount: slidesBefore }, {
        timeout: timeoutMs,
        polling: 'raf',
      });
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          code: 'ControlLeft',
          key: 'Control',
        }));
      });
      const slideObservationHandle = await slideObservation;
      const slideActive = await slideObservationHandle.jsonValue();
      await slideObservationHandle.dispose();
      // Stop forward motion before the screenshot's capture latency can carry the
      // player beyond the bounded evidence fixture. Keep crouch held until after
      // the screenshot so the slide pose remains legible even if the fixed slide
      // duration expires while Chromium rasterizes the frame.
      await releaseSlideDriveInputs();
      summary.driver.actions.slide = {
        previousCount: slidesBefore,
        currentCount: slideActive.sample.semanticEventCounts.slide_started ?? 0,
        locomotion: slideActive.authority.locomotion,
        stance: slideActive.authority.stance,
      };
      check('driver.action.slide', (
        summary.driver.actions.slide.currentCount === slidesBefore + 1
        && slideActive.authority.locomotion === 'sliding'
        && slideActive.authority.stance === 'crouched'
      ), summary.driver.actions.slide);
      await captureScreenshot(page, 'driver_slide', screenshotTargets.driverSlide);
      await readDiagnosticsSurface(page, 'slide');
    } finally {
      await releaseSlideInputs().catch(() => {});
    }
    await page.waitForFunction(({ property }) => {
      const canvas = document.querySelector('#game-canvas');
      const current = canvas?.[property];
      return current
        && current.authority.grounded === true
        && current.authority.locomotion !== 'sliding';
    }, { property: DRIVER_PROPERTY }, { timeout: timeoutMs, polling: 50 });

    const beforeTeleport = await readDiagnosticsSurface(page, 'before_teleport');
    const teleportsBefore = beforeTeleport.value.sample.semanticEventCounts.teleport_succeeded ?? 0;
    const teleportObservationPromise = page.waitForFunction(({ property, eventCount }) => {
      const canvas = document.querySelector('#game-canvas');
      const current = canvas?.[property];
      if (
        !current
        || (current.sample.semanticEventCounts.teleport_succeeded ?? 0) <= eventCount
        || current.render.teleportSnapActive !== true
      ) {
        return false;
      }
      return {
        diagnostics: JSON.parse(JSON.stringify(current)),
        recursivelyFrozen: (() => {
          const pending = [current];
          const seen = new Set();
          while (pending.length > 0) {
            const value = pending.pop();
            if (value === null || typeof value !== 'object' || seen.has(value)) continue;
            seen.add(value);
            if (!Object.isFrozen(value)) return false;
            pending.push(...Object.values(value));
          }
          return true;
        })(),
      };
    }, {
      property: DRIVER_PROPERTY,
      eventCount: teleportsBefore,
    }, { timeout: timeoutMs, polling: 50 });
    await dispatchKeyEdge(page, 'KeyQ');
    const teleportHandle = await teleportObservationPromise;
    const teleportActive = await teleportHandle.jsonValue();
    await teleportHandle.dispose();
    await page.locator('#teleport-flash.show').waitFor({
      state: 'attached',
      timeout: timeoutMs,
    });
    const teleport = await readDiagnosticsSurface(page, 'teleport');
    const authorityDistanceMm = Math.hypot(
      teleport.value.authority.feetPositionMm.x
        - beforeTeleport.value.authority.feetPositionMm.x,
      teleport.value.authority.feetPositionMm.z
        - beforeTeleport.value.authority.feetPositionMm.z,
    );
    const renderDistance = Math.hypot(
      teleport.value.render.position.x - beforeTeleport.value.render.position.x,
      teleport.value.render.position.z - beforeTeleport.value.render.position.z,
    );
    const expectedRenderDistance = authorityDistanceMm / 1_000;
    summary.driver.actions.teleport = {
      key: 'KeyQ',
      previousCount: teleportsBefore,
      currentCount: teleport.value.sample.semanticEventCounts.teleport_succeeded ?? 0,
      authorityDistanceMm,
      renderDistance,
      expectedRenderDistance,
      renderDistanceError: Math.abs(renderDistance - expectedRenderDistance),
      snapObserved: teleportActive?.diagnostics?.render?.teleportSnapActive === true,
      activeSnapshotRecursivelyFrozen: teleportActive?.recursivelyFrozen === true,
      activeSnapshotSha256: teleportActive?.diagnostics
        ? jsonSha256(teleportActive.diagnostics)
        : null,
    };
    check('driver.action.teleport_q', (
      summary.driver.actions.teleport.currentCount === teleportsBefore + 1
      && authorityDistanceMm > 1_000
      && summary.driver.actions.teleport.renderDistanceError <= 0.01
      && summary.driver.actions.teleport.snapObserved
      && summary.driver.actions.teleport.activeSnapshotRecursivelyFrozen
    ), summary.driver.actions.teleport);
    await captureScreenshot(page, 'driver_teleport', screenshotTargets.driverTeleport);

    const final = await readDiagnosticsSurface(page, 'final');
    check('driver.final_surface', (
      final.value.status === 'running'
      && final.value.sample.totalTicksStepped > 0
      && final.value.sample.semanticEventCounts.jumped >= 1
      && final.value.sample.semanticEventCounts.slide_started >= 1
      && final.value.sample.semanticEventCounts.teleport_succeeded >= 1
      && final.value.render.stance === final.value.authority.stance
    ), {
      status: final.value.status,
      totalTicksStepped: final.value.sample.totalTicksStepped,
      semanticEventCounts: final.value.sample.semanticEventCounts,
      renderStance: final.value.render.stance,
      authorityStance: final.value.authority.stance,
    });
    check('driver.completed', true);
  } catch (error) {
    const serialized = serializeError(error);
    summary.driver.errors.push(serialized);
    check('driver.completed', false, { error: serialized });
    await captureScreenshot(page, 'failure', screenshotTargets.failure).catch((captureError) => {
      summary.driver.errors.push(serializeError(captureError));
    });
  } finally {
    await page.keyboard.up('ControlLeft').catch(() => {});
    await page.keyboard.up('ShiftLeft').catch(() => {});
    await page.keyboard.up('w').catch(() => {});
  }
}

let browser;
let context;
let page;
let monitor = null;
let video;
try {
  progress(`preflight: ${baseUrl.href}`);
  const nodeTape = await loadNodeEvidence();

  let preflightResponse;
  try {
    preflightResponse = await fetch(baseUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.min(timeoutMs, 10_000)),
    });
    requireCheck('preflight.server_available', preflightResponse.ok, {
      requestedUrl: baseUrl.href,
      finalUrl: preflightResponse.url,
      status: preflightResponse.status,
    });
  } finally {
    await preflightResponse?.body?.cancel().catch(() => {});
  }

  summary.runtime.playwright = await installedPackageVersion('playwright');
  browser = await chromium.launch({
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
  });
  summary.runtime.chromium = browser.version();
  progress(`browser ready: Chromium ${summary.runtime.chromium}`);

  context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: {
      dir: videosDirectory,
      size: { width, height },
    },
  });
  page = await context.newPage();
  video = page.video();
  monitor = monitorPage(page);

  await runFixtureLab(page, nodeTape);
  const browserRuntime = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    userAgentData: navigator.userAgentData?.toJSON?.() ?? null,
  }));
  summary.runtime.userAgent = browserRuntime.userAgent;
  summary.runtime.userAgentData = browserRuntime.userAgentData;
  await runDevelopmentDriver(page, monitor, nodeTape);
  await page.waitForTimeout(250);
  finalizeNetwork(monitor);
  check('harness.completed', true, {
    fixtureLabErrors: summary.fixtureLab.errors.length,
    driverErrors: summary.driver.errors.length,
  });
} catch (error) {
  const serialized = serializeError(error);
  summary.errors.push(serialized);
  check('harness.completed', false, { error: serialized });
  if (page !== undefined) {
    await captureScreenshot(page, 'failure', screenshotTargets.failure).catch((captureError) => {
      summary.errors.push(serializeError(captureError));
    });
  }
  finalizeNetwork(monitor);
} finally {
  await context?.close().catch((error) => summary.errors.push(serializeError(error)));
  if (video !== undefined && video !== null) {
    try {
      const videoPath = await video.path();
      const fingerprint = await fingerprintFile(videoPath);
      const record = {
        id: 'phase3_driver_session',
        path: path.relative(outputDirectory, videoPath).replaceAll('\\', '/'),
        capturedAt: new Date().toISOString(),
        ...fingerprint,
      };
      summary.videos.push(record);
      check('artifact.video.phase3_driver_session', fingerprint.bytes > 0, record);
    } catch (error) {
      const serialized = serializeError(error);
      summary.errors.push(serialized);
      check('artifact.video.phase3_driver_session', false, { error: serialized });
    }
  } else {
    check('artifact.video.phase3_driver_session', false, {
      reason: 'Playwright did not expose a video handle',
    });
  }
  await browser?.close().catch((error) => summary.errors.push(serializeError(error)));
}

const requiredScreenshotIds = [
  'fixture_lab',
  'driver_ready',
  'driver_run',
  'driver_jump',
  'driver_slide',
  'driver_teleport',
];
check('artifact.required_screenshots', requiredScreenshotIds.every(
  (id) => summary.screenshots.some((screenshot) => screenshot.id === id),
), {
  required: requiredScreenshotIds,
  captured: summary.screenshots.map((screenshot) => screenshot.id),
});

summary.completedAt = new Date().toISOString();
summary.durationMs = Date.now() - startedAt;
summary.ok = summary.failures.length === 0 && summary.errors.length === 0;
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

progress(
  `complete: ${summary.ok ? 'PASS' : 'FAIL'} (${summary.checks.length} checks, ${summary.failures.length} failures)`,
);
process.stdout.write(`${JSON.stringify({
  ok: summary.ok,
  artifactScope: summary.artifactScope,
  g2Status: summary.g2Status,
  humanReviewStatus: summary.humanReviewStatus,
  summaryPath,
  checks: summary.checks.length,
  failures: summary.failures.map((failure) => failure.id),
  screenshots: summary.screenshots.map((screenshot) => screenshot.path),
  videos: summary.videos.map((record) => record.path),
}, null, 2)}\n`);
if (!summary.ok) process.exitCode = 1;
