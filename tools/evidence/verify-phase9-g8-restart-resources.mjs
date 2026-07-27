import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function option(name, fallback = '') {
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

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('--base-url must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('--base-url must not contain credentials');
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

async function fingerprint(relativePath) {
  const bytes = await readFile(path.join(repositoryRoot, relativePath));
  return {
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function readSnapshot(page) {
  const serialized = await page.locator('#game-canvas').getAttribute('data-kyx-dev-metrics');
  if (!serialized) throw new Error('G8_RESTART_METRICS_MISSING');
  return JSON.parse(serialized);
}

async function waitForStableResources(page, maximumSamples = 15) {
  let previousKey = null;
  let consecutiveMatches = 0;
  let latest = null;
  for (let index = 0; index < maximumSamples; index++) {
    await page.waitForTimeout(1_100);
    latest = await readSnapshot(page);
    const key = [
      latest.memory.geometries,
      latest.memory.textures,
      latest.programs,
      latest.sceneObjects,
    ].join('/');
    if (key === previousKey) consecutiveMatches += 1;
    else consecutiveMatches = 0;
    previousKey = key;
    if (consecutiveMatches >= 2) return latest;
  }
  throw new Error(`G8_RESTART_RESOURCES_DID_NOT_SETTLE: last=${previousKey}`);
}

function resourceCounters(snapshot) {
  return {
    geometries: snapshot.memory.geometries,
    textures: snapshot.memory.textures,
    programs: snapshot.programs,
    sceneObjects: snapshot.sceneObjects,
    maxDrawCalls: snapshot.renderRange?.maxCalls ?? null,
  };
}

const baseUrl = normalizeBaseUrl(option('base-url', 'http://127.0.0.1:5173/'));
const restartCount = positiveInteger('restarts', 5);
const browserExecutable = option('browser-executable').trim() || undefined;
const quality = option('quality', 'high');
if (!['low', 'medium', 'high'].includes(quality)) {
  throw new Error('--quality must be low, medium, or high');
}

const sourceFiles = [
  'src/core/Game.js',
  'src/entities/Bot.js',
  'src/entities/BotManager.js',
  'src/world/PickupSystem.js',
  'tools/evidence/verify-phase9-g8-restart-resources.mjs',
];
const source = {};
for (const relativePath of sourceFiles) source[relativePath] = await fingerprint(relativePath);
const [{ stdout: commitStdout }, { stdout: sourceStatusStdout }] = await Promise.all([
  execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
  execFileAsync(
    'git',
    ['status', '--short', '--untracked-files=all', '--', ...sourceFiles],
    { cwd: repositoryRoot },
  ),
]);

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({
  headless: !flag('headed'),
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
});

let report;
try {
  const context = await browser.newContext({ viewport: { width: 1_920, height: 1_080 } });
  await context.addInitScript((selectedQuality) => {
    localStorage.setItem('sio_settings', JSON.stringify({ quality: selectedQuality }));
  }, quality);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ name: error.name, message: error.message });
  });

  const response = await page.goto(baseUrl.href, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => {
    const serialized = document.querySelector('#game-canvas')?.dataset.kyxDevMetrics;
    if (!serialized) return false;
    return JSON.parse(serialized).frameTimes?.count > 0;
  }, undefined, { timeout: 20_000 });

  const startButton = page.locator('#play-btn');
  await startButton.waitFor({ state: 'visible', timeout: 20_000 });
  await startButton.click({ force: true });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#game-canvas');
    const serialized = canvas?.dataset.kyxDevMetrics;
    return document.pointerLockElement === canvas
      && serialized
      && JSON.parse(serialized).state === 'playing'
      && document.querySelector('#pause-menu')?.classList.contains('hidden') === true;
  }, undefined, { timeout: 20_000 });

  const baselineSnapshot = await waitForStableResources(page, 20);
  const baseline = resourceCounters(baselineSnapshot);
  const restarts = [];
  for (let restart = 1; restart <= restartCount; restart++) {
    await page.locator('#restart-btn').evaluate((button) => button.click());
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#game-canvas');
      const serialized = canvas?.dataset.kyxDevMetrics;
      return document.pointerLockElement === canvas
        && serialized
        && JSON.parse(serialized).state === 'playing'
        && document.querySelector('#pause-menu')?.classList.contains('hidden') === true;
    }, undefined, { timeout: 10_000 });
    restarts.push({
      restart,
      ...resourceCounters(await waitForStableResources(page)),
    });
  }

  const webgl = await page.evaluate(() => {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      userAgent: navigator.userAgent,
    };
  });
  const stable = restarts.every((sample) => (
    sample.geometries === baseline.geometries
    && sample.textures === baseline.textures
    && sample.programs === baseline.programs
    && sample.sceneObjects === baseline.sceneObjects
  ));
  report = {
    schemaVersion: 1,
    status: stable && consoleErrors.length === 0 && pageErrors.length === 0 ? 'PASS' : 'FAIL',
    source: {
      commit: commitStdout.trim(),
      dirty: sourceStatusStdout.trim().length > 0,
      statusShort: sourceStatusStdout.trim().split(/\r?\n/).filter(Boolean),
      files: source,
    },
    browser: webgl,
    page: {
      url: page.url(),
      status: response?.status() ?? null,
      quality,
      viewport: { width: 1_920, height: 1_080 },
      pointerLockVerified: true,
      pauseHiddenVerified: true,
    },
    baseline,
    restarts,
    consoleErrors,
    pageErrors,
  };
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
