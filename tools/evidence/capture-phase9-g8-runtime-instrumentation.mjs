import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const minimumQualifyingSoakMs = 30 * 60 * 1_000;

function option(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function positiveInteger(name, fallback) {
  const value = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(name, fallback) {
  const value = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer`);
  }
  return value;
}

function optionalText(name) {
  const value = option(name, '').trim();
  return value.length > 0 ? value : null;
}

function finiteSeriesSummary(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  const at = (quantile) => sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1) ?? null,
  };
}

function linearSlopePerMinute(samples, selector) {
  const points = samples
    .map((sample) => ({ x: sample.elapsedMs / 60_000, y: selector(sample) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 2) return null;
  const meanX = points.reduce((total, point) => total + point.x, 0) / points.length;
  const meanY = points.reduce((total, point) => total + point.y, 0) / points.length;
  const denominator = points.reduce(
    (total, point) => total + ((point.x - meanX) ** 2),
    0,
  );
  if (denominator === 0) return null;
  return points.reduce(
    (total, point) => total + ((point.x - meanX) * (point.y - meanY)),
    0,
  ) / denominator;
}

function counterDeltaMs(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous)
    ? (current - previous) * 1_000
    : null;
}

function finiteGrowth(first, last) {
  return Number.isFinite(first) && Number.isFinite(last) ? last - first : null;
}

function normalizeBaseUrl(value) {
  const result = new URL(value);
  if (!['http:', 'https:'].includes(result.protocol)) {
    throw new Error('--base-url must use HTTP or HTTPS');
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fingerprint(targetPath) {
  const bytes = await readFile(targetPath);
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
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

const baseUrl = normalizeBaseUrl(option('base-url', 'http://127.0.0.1:5173/'));
const durationMs = positiveInteger('duration-ms', 15_000);
const sampleIntervalMs = positiveInteger('sample-interval-ms', 1_000);
const qualifyingCandidate = flag('qualifying-candidate');
const warmupMs = positiveInteger('warmup-ms', qualifyingCandidate ? 60_000 : 2_000);
const width = positiveInteger('width', 1_920);
const height = positiveInteger('height', 1_080);
const tier = option('tier', 'baseline');
const quality = option('quality', tier === 'low' ? 'low' : 'high');
const headed = flag('headed');
const softwareRenderer = flag('software-renderer');
const finalIntegratedBuild = flag('final-integrated-build');
const machineId = optionalText('machine-id');
const gpuDriver = optionalText('gpu-driver');
const powerMode = optionalText('power-mode');
const thermalState = optionalText('thermal-state');
const displayRefreshHz = nonNegativeInteger('display-refresh-hz', 0) || null;
const matchSeed = optionalText('match-seed') ?? 'offline-practice-default';
const scenario = option('scenario', 'offline-practice-eight-character-traversal').trim();
const playerCount = positiveInteger('player-count', 1);
const botCount = nonNegativeInteger('bot-count', 7);
const outputDirectory = path.resolve(
  repositoryRoot,
  option(
    'output-dir',
    'evidence/2026-07-22/phase-9-g8-runtime-instrumentation/smoke-v1',
  ),
);
const allowOverwrite = flag('allow-overwrite');
const summaryPath = path.join(outputDirectory, 'runtime-instrumentation.json');
const screenshotPath = path.join(outputDirectory, 'active-match.png');

if (!['low', 'baseline', 'high'].includes(tier)) {
  throw new Error('--tier must be low, baseline, or high');
}
if (!['low', 'medium', 'high'].includes(quality)) {
  throw new Error('--quality must be low, medium, or high');
}
if (scenario.length === 0) throw new Error('--scenario must not be empty');
if (qualifyingCandidate && durationMs < minimumQualifyingSoakMs) {
  throw new Error('--qualifying-candidate requires at least 30 minutes of active capture');
}
if (qualifyingCandidate && warmupMs < 60_000) {
  throw new Error('--qualifying-candidate requires at least 60 seconds of warmup');
}
if (qualifyingCandidate && !headed) {
  throw new Error('--qualifying-candidate requires --headed');
}
if (qualifyingCandidate && softwareRenderer) {
  throw new Error('--qualifying-candidate cannot use --software-renderer');
}
if (qualifyingCandidate && !finalIntegratedBuild) {
  throw new Error('--qualifying-candidate requires --final-integrated-build');
}
if (qualifyingCandidate && playerCount + botCount < 8) {
  throw new Error('--qualifying-candidate requires at least eight declared players plus bots');
}
const requiredMachineMetadata = { machineId, gpuDriver, powerMode, thermalState, displayRefreshHz };
const missingMachineMetadata = Object.entries(requiredMachineMetadata)
  .filter(([, value]) => value === null)
  .map(([name]) => name);
if (qualifyingCandidate && missingMachineMetadata.length > 0) {
  throw new Error(`--qualifying-candidate is missing named-machine metadata: ${missingMachineMetadata.join(', ')}`);
}
for (const targetPath of [summaryPath, screenshotPath]) {
  if (await exists(targetPath) && !allowOverwrite) {
    throw new Error(`G8_OUTPUT_EXISTS: refusing to overwrite ${targetPath}`);
  }
}
await mkdir(outputDirectory, { recursive: true });

const summary = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  artifactScope: 'PHASE_9_G8_RUNTIME_INSTRUMENTATION',
  evidenceLabel: qualifyingCandidate
    ? 'SOAK_INPUT_REQUIRES_FINAL_GATE_REVIEW'
    : 'NON_QUALIFYING_INSTRUMENTATION_SMOKE',
  g8Status: 'OPEN',
  visualApproval: 'NOT_PERFORMED_OR_CLAIMED',
  nonClaims: [
    'This capture does not prove final-map, final-character, eight-player, GPU-timer, or named-hardware performance.',
    'A duration below 30 minutes is a harness smoke, not a soak result.',
    'A 30-minute run without --qualifying-candidate and complete named-machine metadata remains non-qualifying.',
    'Passing structural checks does not close G8.',
  ],
  baseUrl: baseUrl.href,
  requested: {
    tier,
    quality,
    viewport: { width, height, deviceScaleFactor: 1 },
    durationMs,
    sampleIntervalMs,
    warmupMs,
    minimumQualifyingSoakMs,
    qualifyingCandidate,
    headed,
    softwareRenderer,
    finalIntegratedBuild,
    scenario,
    matchSeed,
    playerCount,
    botCount,
  },
  host: {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    logicalCpuCount: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? null,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytesAtStart: os.freemem(),
    machineId,
    gpuDriver,
    powerMode,
    thermalState,
    displayRefreshHz,
    missingMachineMetadata,
  },
  browser: null,
  product: null,
  samples: [],
  aggregate: null,
  network: null,
  assessment: null,
  artifacts: [],
  sources: {},
  checks: [],
  failures: [],
  errors: [],
  ok: false,
};

function check(id, passed, details = {}) {
  const record = { id, passed: Boolean(passed), details };
  summary.checks.push(record);
  if (!record.passed) summary.failures.push(record);
  return record.passed;
}

function metricMap(metrics) {
  return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
}

async function readCaptureWindowAggregate(targetPage, resetAfterRead) {
  return targetPage.evaluate((shouldReset) => {
    const capture = window.__KYX_G8_CAPTURE__;
    const summarize = (values) => {
      const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
      const at = (quantile) => sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))];
      return {
        count: sorted.length,
        p50Ms: at(0.5),
        p95Ms: at(0.95),
        p99Ms: at(0.99),
        maxMs: at(1),
      };
    };
    const result = {
      durationMs: performance.now() - capture.startedAtMs,
      frameTimes: summarize(capture.frameTimes),
      droppedFrameSamples: capture.droppedFrameSamples,
      longTasks: {
        ...summarize(capture.longTasks.map((entry) => entry.durationMs)),
        totalDurationMs: capture.longTasks.reduce(
          (total, entry) => total + entry.durationMs,
          0,
        ),
        over50MsCount: capture.longTasks.filter((entry) => entry.durationMs > 50).length,
      },
    };
    if (shouldReset) {
      capture.frameTimes.length = 0;
      capture.longTasks.length = 0;
      capture.droppedFrameSamples = 0;
      capture.startedAtMs = performance.now();
    }
    return result;
  }, resetAfterRead);
}

async function applyActivityStep(targetPage, step, heldKey) {
  const movementKeys = ['w', 'd', 's', 'a'];
  const nextKey = movementKeys[step % movementKeys.length];
  if (heldKey !== nextKey) {
    if (heldKey !== null) await targetPage.keyboard.up(heldKey).catch(() => {});
    await targetPage.keyboard.down(nextKey);
  }
  if (step % 2 === 0) await targetPage.mouse.click(width / 2, height / 2).catch(() => {});
  if (step % 5 === 0) await targetPage.keyboard.press('Space').catch(() => {});
  if (step % 11 === 0) await targetPage.keyboard.press('q').catch(() => {});
  return nextKey;
}

const requests = [];
const consoleErrors = [];
const pageErrors = [];
let browser;
let context;
let page;
let cdp;

try {
  const preflight = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) });
  check('preflight.server_available', preflight.ok, {
    status: preflight.status,
    finalUrl: preflight.url,
  });
  await preflight.body?.cancel();

  const browserArgs = ['--enable-webgl', '--ignore-gpu-blocklist'];
  if (softwareRenderer) browserArgs.push('--use-angle=swiftshader');
  browser = await chromium.launch({
    headless: !headed,
    args: browserArgs,
  });
  context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(({ serializedSettings }) => {
    localStorage.setItem('sio_settings', serializedSettings);
    const capture = {
      frameTimes: [],
      longTasks: [],
      droppedFrameSamples: 0,
      startedAtMs: performance.now(),
    };
    Object.defineProperty(window, '__KYX_G8_CAPTURE__', {
      value: capture,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    let previousFrame;
    const sampleFrame = (now) => {
      if (previousFrame !== undefined) {
        if (capture.frameTimes.length < 250_000) capture.frameTimes.push(now - previousFrame);
        else capture.droppedFrameSamples += 1;
      }
      previousFrame = now;
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
    if (
      typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (capture.longTasks.length < 10_000) {
            capture.longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
          }
        }
      }).observe({ type: 'longtask', buffered: true });
    }
  }, {
    serializedSettings: JSON.stringify({ quality }),
  });

  page = await context.newPage();
  cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(serializeError(error)));
  page.on('request', (request) => requests.push(request));

  const response = await page.goto(baseUrl.href, { waitUntil: 'networkidle', timeout: 30_000 });
  check('product.document_ok', Boolean(response?.ok()), {
    status: response?.status() ?? null,
    finalUrl: page.url(),
  });
  const canvas = page.locator('#game-canvas');
  await page.waitForFunction(() => {
    const serialized = document.querySelector('#game-canvas')?.dataset.kyxDevMetrics;
    return Boolean(serialized && JSON.parse(serialized).frameTimes?.count > 0);
  }, undefined, { timeout: 15_000 });

  const menuMetrics = JSON.parse(await canvas.getAttribute('data-kyx-dev-metrics'));
  const startButton = page.getByRole('button', { name: 'START OFFLINE PRACTICE', exact: true });
  await startButton.click();
  await page.waitForFunction(() => {
    const serialized = document.querySelector('#game-canvas')?.dataset.kyxDevMetrics;
    if (!serialized) return false;
    return JSON.parse(serialized).state !== 'menu';
  }, undefined, { timeout: 15_000 });
  await canvas.click({ position: { x: Math.floor(width / 2), y: Math.floor(height / 2) } }).catch(() => {});

  const browserIdentity = await page.evaluate(() => {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: navigator.deviceMemory ?? null,
      screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      webgl: gl ? {
        vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      } : null,
    };
  });
  summary.browser = {
    product: 'Chromium',
    version: browser.version(),
    ...browserIdentity,
  };
  summary.product = {
    title: await page.title(),
    url: page.url(),
    menuMetrics,
    startupAndTransitionAggregate: await readCaptureWindowAggregate(page, true),
    warmup: null,
  };

  const warmupStartedAt = Date.now();
  let warmupHeldKey = null;
  let warmupStep = 0;
  try {
    while (Date.now() - warmupStartedAt < warmupMs) {
      warmupHeldKey = await applyActivityStep(page, warmupStep, warmupHeldKey);
      warmupStep += 1;
      const remainingWarmupMs = warmupMs - (Date.now() - warmupStartedAt);
      await page.waitForTimeout(Math.min(500, Math.max(1, remainingWarmupMs)));
    }
  } finally {
    if (warmupHeldKey !== null) await page.keyboard.up(warmupHeldKey).catch(() => {});
  }
  summary.product.warmup = {
    requestedDurationMs: warmupMs,
    actualDurationMs: Date.now() - warmupStartedAt,
    activitySteps: warmupStep,
    aggregate: await readCaptureWindowAggregate(page, true),
  };

  const captureStartedAt = Date.now();
  let captureHeldKey = null;
  let captureActivityStep = 0;
  let previousPerformanceCounters = null;
  try {
    while (Date.now() - captureStartedAt < durationMs) {
      captureHeldKey = await applyActivityStep(page, captureActivityStep, captureHeldKey);
      captureActivityStep += 1;
      const remainingMs = durationMs - (Date.now() - captureStartedAt);
      await page.waitForTimeout(Math.min(sampleIntervalMs, Math.max(1, remainingMs)));
      const [serializedMetrics, performanceMetrics, domCounters, hostFreeMemoryBytes] = await Promise.all([
        canvas.getAttribute('data-kyx-dev-metrics'),
        cdp.send('Performance.getMetrics'),
        cdp.send('Memory.getDOMCounters'),
        Promise.resolve(os.freemem()),
      ]);
      const metrics = metricMap(performanceMetrics.metrics);
      const elapsedMs = Date.now() - captureStartedAt;
      const currentPerformanceCounters = {
        elapsedMs,
        taskDurationSeconds: metrics.TaskDuration ?? null,
        scriptDurationSeconds: metrics.ScriptDuration ?? null,
        layoutDurationSeconds: metrics.LayoutDuration ?? null,
      };
      const interval = previousPerformanceCounters === null ? null : {
        elapsedMs: elapsedMs - previousPerformanceCounters.elapsedMs,
        taskDurationMs: counterDeltaMs(
          currentPerformanceCounters.taskDurationSeconds,
          previousPerformanceCounters.taskDurationSeconds,
        ),
        scriptDurationMs: counterDeltaMs(
          currentPerformanceCounters.scriptDurationSeconds,
          previousPerformanceCounters.scriptDurationSeconds,
        ),
        layoutDurationMs: counterDeltaMs(
          currentPerformanceCounters.layoutDurationSeconds,
          previousPerformanceCounters.layoutDurationSeconds,
        ),
      };
      summary.samples.push({
        elapsedMs,
        renderer: serializedMetrics ? JSON.parse(serializedMetrics) : null,
        chromium: {
          jsHeapUsedBytes: metrics.JSHeapUsedSize ?? null,
          jsHeapTotalBytes: metrics.JSHeapTotalSize ?? null,
          taskDurationSeconds: metrics.TaskDuration ?? null,
          scriptDurationSeconds: metrics.ScriptDuration ?? null,
          layoutDurationSeconds: metrics.LayoutDuration ?? null,
          nodes: domCounters.nodes,
          documents: domCounters.documents,
          jsEventListeners: domCounters.jsEventListeners,
          interval,
        },
        hostFreeMemoryBytes,
      });
      previousPerformanceCounters = currentPerformanceCounters;
    }
  } finally {
    if (captureHeldKey !== null) await page.keyboard.up(captureHeldKey).catch(() => {});
  }

  const captureAggregate = await readCaptureWindowAggregate(page, false);
  const firstSample = summary.samples[0] ?? null;
  const lastSample = summary.samples.at(-1) ?? null;
  const renderCalls = summary.samples.map((sample) => sample.renderer?.renderRange?.maxCalls ?? null);
  const renderTriangles = summary.samples.map(
    (sample) => sample.renderer?.renderRange?.maxTriangles ?? null,
  );
  const sceneObjects = summary.samples.map((sample) => sample.renderer?.sceneObjects ?? null);
  const geometries = summary.samples.map((sample) => sample.renderer?.memory?.geometries ?? null);
  const textures = summary.samples.map((sample) => sample.renderer?.memory?.textures ?? null);
  const taskDurationIntervals = summary.samples.map(
    (sample) => sample.chromium.interval?.taskDurationMs ?? null,
  );
  const scriptDurationIntervals = summary.samples.map(
    (sample) => sample.chromium.interval?.scriptDurationMs ?? null,
  );
  const layoutDurationIntervals = summary.samples.map(
    (sample) => sample.chromium.interval?.layoutDurationMs ?? null,
  );
  summary.aggregate = {
    ...captureAggregate,
    qualifyingSoakDuration: durationMs >= minimumQualifyingSoakMs,
    qualifyingSoakInput: qualifyingCandidate && durationMs >= minimumQualifyingSoakMs,
    sampleCount: summary.samples.length,
    activitySteps: captureActivityStep,
    jsHeapGrowthBytes: firstSample && lastSample
      ? finiteGrowth(firstSample.chromium.jsHeapUsedBytes, lastSample.chromium.jsHeapUsedBytes)
      : null,
    nodeGrowth: firstSample && lastSample
      ? finiteGrowth(firstSample.chromium.nodes, lastSample.chromium.nodes)
      : null,
    listenerGrowth: firstSample && lastSample
      ? finiteGrowth(firstSample.chromium.jsEventListeners, lastSample.chromium.jsEventListeners)
      : null,
    resourceRanges: {
      renderCalls: finiteSeriesSummary(renderCalls),
      renderTriangles: finiteSeriesSummary(renderTriangles),
      sceneObjects: finiteSeriesSummary(sceneObjects),
      geometries: finiteSeriesSummary(geometries),
      textures: finiteSeriesSummary(textures),
    },
    chromiumIntervals: {
      taskDurationMs: finiteSeriesSummary(taskDurationIntervals),
      scriptDurationMs: finiteSeriesSummary(scriptDurationIntervals),
      layoutDurationMs: finiteSeriesSummary(layoutDurationIntervals),
      note: 'Each value is accumulated Chromium work during one sampling interval, not per-frame main-thread timing.',
    },
    trendsPerMinute: {
      jsHeapUsedBytes: linearSlopePerMinute(
        summary.samples,
        (sample) => sample.chromium.jsHeapUsedBytes,
      ),
      nodes: linearSlopePerMinute(summary.samples, (sample) => sample.chromium.nodes),
      jsEventListeners: linearSlopePerMinute(
        summary.samples,
        (sample) => sample.chromium.jsEventListeners,
      ),
      hostFreeMemoryBytes: linearSlopePerMinute(
        summary.samples,
        (sample) => sample.hostFreeMemoryBytes,
      ),
    },
  };

  await page.screenshot({ path: screenshotPath, animations: 'disabled' });
  summary.artifacts.push({
    id: 'active_match',
    path: path.relative(outputDirectory, screenshotPath).replaceAll('\\', '/'),
    ...await fingerprint(screenshotPath),
  });

  const requestSizes = await Promise.all(requests.map(async (request) => {
    try {
      return { url: request.url(), resourceType: request.resourceType(), ...await request.sizes() };
    } catch (error) {
      return { url: request.url(), resourceType: request.resourceType(), error: serializeError(error) };
    }
  }));
  summary.network = {
    requestCount: requestSizes.length,
    transferBytes: requestSizes.reduce(
      (total, record) => total + Math.max(0, record.responseBodySize ?? 0),
      0,
    ),
    resources: requestSizes,
  };

  const webglRenderer = summary.browser?.webgl?.renderer ?? null;
  const detectedSoftwareRenderer = softwareRenderer || (
    typeof webglRenderer === 'string'
    && /(swiftshader|llvmpipe|software rasterizer)/i.test(webglRenderer)
  );
  const drawCallBudget = tier === 'low' ? 300 : 500;
  const triangleBudget = tier === 'low' ? 700_000 : 1_500_000;
  const firstPlayableTransferBudgetBytes = tier === 'low' ? 12_000_000 : 25_000_000;
  const eligibilityDisqualifiers = [];
  if (!qualifyingCandidate) eligibilityDisqualifiers.push('qualifying_candidate_not_requested');
  if (durationMs < minimumQualifyingSoakMs) eligibilityDisqualifiers.push('active_duration_below_30_minutes');
  if (!headed) eligibilityDisqualifiers.push('browser_not_headed');
  if (detectedSoftwareRenderer) eligibilityDisqualifiers.push('software_renderer_detected');
  if (!finalIntegratedBuild) eligibilityDisqualifiers.push('final_integrated_build_not_declared');
  if (missingMachineMetadata.length > 0) eligibilityDisqualifiers.push('named_machine_metadata_incomplete');
  if (playerCount + botCount < 8) eligibilityDisqualifiers.push('fewer_than_eight_declared_characters');
  summary.assessment = {
    gateDecision: 'G8_OPEN_REQUIRES_FINAL_INTEGRATED_REVIEW',
    eligibleSoakInput: eligibilityDisqualifiers.length === 0,
    eligibilityDisqualifiers,
    detectedSoftwareRenderer,
    webglRenderer,
    budgetSignals: {
      frameP95: {
        targetMs: 16.67,
        observedMs: captureAggregate.frameTimes.p95Ms,
        passed: captureAggregate.frameTimes.p95Ms <= 16.67,
      },
      frameP99: {
        target: 'tracked; no broad pass threshold is specified by the governing budget',
        observedMs: captureAggregate.frameTimes.p99Ms,
        passed: null,
      },
      recurringLongTasks: {
        target: 'zero recurring active-match tasks over 50 ms',
        observedOver50MsCount: captureAggregate.longTasks.over50MsCount,
        passed: captureAggregate.longTasks.over50MsCount === 0,
      },
      drawCalls: {
        targetMaximum: drawCallBudget,
        observedMaximum: summary.aggregate.resourceRanges.renderCalls.max,
        passed: Number.isFinite(summary.aggregate.resourceRanges.renderCalls.max)
          && summary.aggregate.resourceRanges.renderCalls.max <= drawCallBudget,
      },
      visibleTriangles: {
        targetMaximum: triangleBudget,
        observedMaximum: summary.aggregate.resourceRanges.renderTriangles.max,
        passed: Number.isFinite(summary.aggregate.resourceRanges.renderTriangles.max)
          && summary.aggregate.resourceRanges.renderTriangles.max <= triangleBudget,
      },
      firstPlayableTransfer: {
        targetMaximumBytes: firstPlayableTransferBudgetBytes,
        observedBytes: summary.network.transferBytes,
        passed: summary.network.transferBytes <= firstPlayableTransferBudgetBytes,
        limitation: 'Request body sizes are a browser-observed transfer signal; cold/warm cache proof remains separate.',
      },
    },
    unavailableOrSeparateEvidence: [
      'GPU p95 timer-query evidence is not produced by this browser harness.',
      'Authoritative room tick p99 and network cost require a separate full-occupancy Worker capture.',
      'Eight-character visibility, final VFX caps, and visual readability require direct scene review.',
      'A flat first-to-last memory delta is not a leak verdict; trend and retained-object review remain required.',
    ],
  };

  check('runtime.active_state_sampled', summary.samples.some(
    (sample) => sample.renderer && sample.renderer.state !== 'menu'
  ));
  check('runtime.minimum_sample_count', summary.samples.length >= Math.max(2, Math.floor(durationMs / sampleIntervalMs) - 1), {
    sampleCount: summary.samples.length,
  });
  check('runtime.frame_distribution_present', captureAggregate.frameTimes.count > 0, captureAggregate.frameTimes);
  check('runtime.warmup_completed', summary.product.warmup.actualDurationMs >= warmupMs, {
    warmup: summary.product.warmup,
  });
  check('runtime.resource_distributions_present', (
    summary.aggregate.resourceRanges.renderCalls.count > 0
    && summary.aggregate.resourceRanges.renderTriangles.count > 0
    && summary.aggregate.resourceRanges.sceneObjects.count > 0
  ), { resourceRanges: summary.aggregate.resourceRanges });
  check('runtime.assessment_is_nonclaiming', (
    summary.assessment.gateDecision === 'G8_OPEN_REQUIRES_FINAL_INTEGRATED_REVIEW'
  ));
  if (qualifyingCandidate) {
    check('candidate.real_renderer_detected', !detectedSoftwareRenderer, {
      webglRenderer,
      detectedSoftwareRenderer,
    });
    check('candidate.eligibility_contract_satisfied', summary.assessment.eligibleSoakInput, {
      eligibilityDisqualifiers,
    });
  }
  check('runtime.long_task_surface_present', summary.samples.every(
    (sample) => sample.renderer?.longTasks?.recent?.windowMs === 60_000
  ));
  check('runtime.heap_surface_present', summary.samples.every(
    (sample) => sample.chromium.jsHeapUsedBytes > 0
  ));
  check('runtime.no_console_errors', consoleErrors.length === 0, { consoleErrors });
  check('runtime.no_page_errors', pageErrors.length === 0, { pageErrors });
  check('artifact.active_match_present', summary.artifacts[0]?.bytes > 0, summary.artifacts[0]);
} catch (error) {
  summary.errors.push(serializeError(error));
  check('capture.completed', false, { error: serializeError(error) });
} finally {
  await cdp?.detach().catch(() => {});
  await context?.close().catch((error) => summary.errors.push(serializeError(error)));
  await browser?.close().catch((error) => summary.errors.push(serializeError(error)));
}

summary.sources = {
  captureScript: await fingerprint(fileURLToPath(import.meta.url)),
  debugMetrics: await fingerprint(path.join(repositoryRoot, 'src', 'render', 'debugMetrics.ts')),
  world: await fingerprint(path.join(repositoryRoot, 'src', 'world', 'World.js')),
  game: await fingerprint(path.join(repositoryRoot, 'src', 'core', 'Game.js')),
  main: await fingerprint(path.join(repositoryRoot, 'src', 'main.js')),
  packageLock: await fingerprint(path.join(repositoryRoot, 'package-lock.json')),
};
if (!summary.checks.some((record) => record.id === 'capture.completed')) {
  check('capture.completed', summary.errors.length === 0, { errors: summary.errors });
}
summary.completedAt = new Date().toISOString();
summary.ok = summary.failures.length === 0 && summary.errors.length === 0;
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: summary.ok,
  g8Status: summary.g8Status,
  evidenceLabel: summary.evidenceLabel,
  summaryPath,
  checks: summary.checks.length,
  failures: summary.failures.map((failure) => failure.id),
  sampleCount: summary.samples.length,
  frameTimes: summary.aggregate?.frameTimes ?? null,
  longTasks: summary.aggregate?.longTasks ?? null,
}, null, 2)}\n`);
if (!summary.ok) process.exitCode = 1;
