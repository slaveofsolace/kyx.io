import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback) {
  const parsed = Number.parseInt(option(name, String(fallback)), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return parsed;
}

function compactNetworkRecords(eventsByRequest) {
  const records = [...eventsByRequest.values()].filter((record) => record.url);
  const encodedTransferBytes = records.reduce(
    (total, record) => total + (record.encodedDataLength ?? 0),
    0,
  );

  return {
    requestCount: records.length,
    encodedTransferBytes,
    origins: [...new Set(records.map((record) => new URL(record.url).origin))].sort(),
    failures: records.filter(
      (record) => record.failure || (record.status !== undefined && record.status >= 400),
    ),
    largest: records
      .filter((record) => record.encodedDataLength)
      .sort((left, right) => right.encodedDataLength - left.encodedDataLength)
      .slice(0, 20),
    assetTimings: records
      .filter((record) => /\.(?:glb|gltf|png|jpe?g|webp|ktx2|ogg|mp3|wav)(?:[?#]|$)/i.test(record.url))
      .map((record) => ({
        url: record.url,
        status: record.status ?? null,
        mimeType: record.mimeType ?? null,
        encodedDataLength: record.encodedDataLength ?? 0,
        startedAtMonotonicSeconds: record.startedAtMonotonicSeconds ?? null,
        responseAtMonotonicSeconds: record.responseAtMonotonicSeconds ?? null,
        finishedAtMonotonicSeconds: record.finishedAtMonotonicSeconds ?? null,
        durationMs: record.startedAtMonotonicSeconds !== undefined
          && record.finishedAtMonotonicSeconds !== undefined
          ? (record.finishedAtMonotonicSeconds - record.startedAtMonotonicSeconds) * 1_000
          : null,
      }))
      .sort((left, right) => left.url.localeCompare(right.url)),
  };
}

const url = option('url', 'http://127.0.0.1:5999/');
const label = option('label', 'local');
const outputDirectory = path.resolve(option('output', 'evidence/baseline'));
const durationMs = positiveInteger('duration-ms', 30_000);
const width = positiveInteger('width', 1920);
const height = positiveInteger('height', 1080);
const seed = positiveInteger('seed', 19_072_026);
const recordVideo = option('record-video', 'true') !== 'false';

const directories = {
  network: path.join(outputDirectory, 'network'),
  profiles: path.join(outputDirectory, 'profiles'),
  screenshots: path.join(outputDirectory, 'screenshots'),
  video: path.join(outputDirectory, 'video'),
  rawVideo: path.join(outputDirectory, 'video', '.raw'),
};
await Promise.all(Object.values(directories).map((directory) => mkdir(directory, { recursive: true })));

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  ...(recordVideo ? {
    recordVideo: {
      dir: directories.rawVideo,
      size: { width, height },
    },
  } : {}),
});
await context.addInitScript(({ captureSeed }) => {
  // Mulberry32: deterministic browser randomness for procedural world, bot,
  // and scoreboard state. Install before any application script executes.
  let state = captureSeed >>> 0;
  Math.random = () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}, { captureSeed: seed });
const page = await context.newPage();
const video = page.video();

const consoleEntries = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (message) => {
  consoleEntries.push({
    type: message.type(),
    text: message.text(),
    location: message.location(),
  });
});
page.on('pageerror', (error) => pageErrors.push({
  name: error?.name ?? null,
  message: error?.message ?? String(error),
  stack: error?.stack ?? null,
}));
page.on('requestfailed', (request) => {
  failedRequests.push({
    url: request.url(),
    method: request.method(),
    failure: request.failure(),
  });
});

const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Performance.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const networkByRequest = new Map();
cdp.on('Network.requestWillBeSent', (event) => {
  const record = networkByRequest.get(event.requestId) ?? { requestId: event.requestId };
  record.url = event.request.url;
  record.method = event.request.method;
  record.type = event.type;
  record.startedAtMonotonicSeconds = event.timestamp;
  record.startedAtWallSeconds = event.wallTime;
  networkByRequest.set(event.requestId, record);
});
cdp.on('Network.responseReceived', (event) => {
  const record = networkByRequest.get(event.requestId) ?? { requestId: event.requestId };
  record.url = event.response.url;
  record.status = event.response.status;
  record.mimeType = event.response.mimeType;
  record.fromDiskCache = event.response.fromDiskCache;
  record.responseAtMonotonicSeconds = event.timestamp;
  networkByRequest.set(event.requestId, record);
});
cdp.on('Network.loadingFinished', (event) => {
  const record = networkByRequest.get(event.requestId) ?? { requestId: event.requestId };
  record.encodedDataLength = event.encodedDataLength;
  record.finishedAtMonotonicSeconds = event.timestamp;
  networkByRequest.set(event.requestId, record);
});
cdp.on('Network.loadingFailed', (event) => {
  const record = networkByRequest.get(event.requestId) ?? { requestId: event.requestId };
  record.failure = event.errorText;
  networkByRequest.set(event.requestId, record);
});

let runError;
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const playButton = page.locator('#play-btn');
  await playButton.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await page.screenshot({
    path: path.join(directories.screenshots, `${label}-menu-${width}x${height}.png`),
  });

  await playButton.click();
  await page.waitForTimeout(4_000);
  await page.screenshot({
    path: path.join(directories.screenshots, `${label}-gameplay-${width}x${height}.png`),
  });

  const metricSamples = [];
  const movementPattern = [
    { key: 'w', duration: 4_000 },
    { key: 'd', duration: 3_000 },
    { key: 's', duration: 3_000 },
    { key: 'a', duration: 3_000 },
  ];
  const recordingStartedAt = Date.now();
  let movementIndex = 0;
  while (Date.now() - recordingStartedAt < durationMs) {
    const movement = movementPattern[movementIndex % movementPattern.length];
    const remaining = durationMs - (Date.now() - recordingStartedAt);
    const stepDuration = Math.max(0, Math.min(movement.duration, remaining));
    if (stepDuration === 0) break;

    await page.keyboard.down(movement.key);
    const stepStartedAt = Date.now();
    while (Date.now() - stepStartedAt < stepDuration) {
      const metrics = await page.locator('#game-canvas').getAttribute('data-kyx-dev-metrics');
      if (metrics) metricSamples.push({ atMs: Date.now() - recordingStartedAt, ...JSON.parse(metrics) });
      await page.waitForTimeout(Math.min(1_000, stepDuration - (Date.now() - stepStartedAt)));
    }
    await page.keyboard.up(movement.key);
    movementIndex += 1;
  }

  const runtime = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const debugRendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    const resources = performance.getEntriesByType('resource');
    return {
      title: document.title,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      userAgent: navigator.userAgent,
      domNodes: document.querySelectorAll('*').length,
      resourceCount: resources.length,
      resourceDurationMs: resources.reduce((maximum, entry) => Math.max(maximum, entry.responseEnd), 0),
      resourceEntries: resources.map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        startTime: entry.startTime,
        duration: entry.duration,
        responseEnd: entry.responseEnd,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      })),
      renderer: debugRendererInfo
        ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) ?? null,
      vendor: debugRendererInfo
        ? gl.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
        : gl?.getParameter(gl.VENDOR) ?? null,
      finalDevMetrics: canvas?.dataset.kyxDevMetrics
        ? JSON.parse(canvas.dataset.kyxDevMetrics)
        : null,
    };
  });
  const performanceMetrics = await cdp.send('Performance.getMetrics');

  await writeFile(
    path.join(directories.profiles, `${label}-runtime.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      browserVersion: browser.version(),
      durationMs,
      recordVideo,
      seed,
      runtime,
      metricSamples,
      performanceMetrics: Object.fromEntries(
        performanceMetrics.metrics.map((metric) => [metric.name, metric.value]),
      ),
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(directories.network, `${label}-network.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      ...compactNetworkRecords(networkByRequest),
      failedRequests,
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDirectory, `${label}-console.json`),
    `${JSON.stringify({ schemaVersion: 1, consoleEntries, pageErrors }, null, 2)}\n`,
  );
} catch (error) {
  runError = error;
} finally {
  await page.close();
  if (video) {
    await video.saveAs(
      path.join(
        directories.video,
        `${label}-baseline-with-${Math.round(durationMs / 1_000)}s-gameplay.webm`,
      ),
    );
    await video.delete();
  }
  await context.close();
  await browser.close();
}

if (runError) throw runError;

console.log(JSON.stringify({
  ok: true,
  url,
  label,
  outputDirectory,
  viewport: { width, height },
  durationMs,
  recordVideo,
  seed,
}, null, 2));
