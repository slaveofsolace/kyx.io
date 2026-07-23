import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const screenshots = path.join(import.meta.dirname, 'screenshots');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const node = process.execPath;
const logs = { vite: '', worker: '' };
const services = [];

function service(name, args, env = process.env) {
  const child = spawn(node, args, {
    cwd: repo,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs[name] += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs[name] += chunk.toString(); });
  services.push(child);
  return child;
}

async function waitForHttp(url, timeoutMilliseconds = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMilliseconds) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return response.status;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`HTTP_TIMEOUT: ${url}`);
}

function snapshot(page) {
  return page.evaluate(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot());
}

function presentationDom(page) {
  return page.evaluate(() => ({
    status: Object.fromEntries(
      Object.entries(document.querySelector('[data-testid="online-presentation-status"]')?.dataset ?? {}),
    ),
    hud: {
      text: document.querySelector('[data-testid="online-confirmed-hud"]')?.textContent ?? null,
      dataset: Object.fromEntries(
        Object.entries(document.querySelector('[data-testid="online-confirmed-hud"]')?.dataset ?? {}),
      ),
    },
    vfx: Object.fromEntries(
      Object.entries(document.querySelector('[data-testid="online-confirmed-vfx"]')?.dataset ?? {}),
    ),
  }));
}

async function captureReadableBoard(page, filename) {
  await page.locator('[data-testid="online-presentation-status"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshots, filename),
    fullPage: false,
  });
}

await mkdir(screenshots, { recursive: true });
let browser;
try {
  service('vite', [
    path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', '5173', '--strictPort',
  ], { ...process.env, VITE_KYX_AUTHORITY_ORIGIN: 'http://127.0.0.1:8787' });
  service('worker', [
    path.join(repo, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    'dev', '--local', '--port', '8787',
  ]);
  await Promise.all([
    waitForHttp('http://127.0.0.1:5173/'),
    waitForHttp('http://127.0.0.1:8787/health'),
  ]);

  browser = await chromium.launch({ headless: true, executablePath: chrome });
  const browserVersion = await browser.version();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const browserErrors = { consoleA: [], consoleB: [], pageA: [], pageB: [], requestA: [], requestB: [] };
  for (const [page, consoleErrors, pageErrors, requestErrors] of [
    [pageA, browserErrors.consoleA, browserErrors.pageA, browserErrors.requestA],
    [pageB, browserErrors.consoleB, browserErrors.pageB, browserErrors.requestB],
  ]) {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('requestfailed', (request) => requestErrors.push({
      url: request.url(),
      failure: request.failure()?.errorText ?? null,
    }));
  }

  await pageA.goto('http://127.0.0.1:5173/online?mode=create', { waitUntil: 'domcontentloaded' });
  await pageA.waitForFunction(() => window.__KYX_ONLINE_PREVIEW__?.getSnapshot().connection === 'joined');
  const roomUrl = pageA.url();
  await pageB.goto(roomUrl, { waitUntil: 'domcontentloaded' });
  await Promise.all([pageA, pageB].map((page) => page.waitForFunction(() => {
    const current = window.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return current?.combat.snapshot?.match.phase === 'active'
      && current.presentation.status === 'ready';
  }, { timeout: 30_000 })));
  const initialA = await snapshot(pageA);
  const initialB = await snapshot(pageB);

  await pageA.keyboard.down('Space');
  await pageA.waitForFunction(() => (
    window.__KYX_ONLINE_PREVIEW__?.getSnapshot().presentation.lastCue === 'body'
  ), { timeout: 10_000 });
  await pageA.keyboard.up('Space');
  await pageA.waitForFunction(() => (
    document.querySelector('[data-testid="online-confirmed-hud"]')?.dataset.audio !== 'pending'
  ));
  const bodyA = await snapshot(pageA);
  const bodyDom = await presentationDom(pageA);
  await pageA.screenshot({
    path: path.join(screenshots, 'g4-02-confirmed-body-hit-hud-vfx.png'),
    fullPage: true,
  });
  await captureReadableBoard(pageA, 'g4-board-02-confirmed-body-hit.png');
  await pageA.keyboard.down('Space');
  await pageA.waitForFunction(() => (
    window.__KYX_ONLINE_PREVIEW__?.getSnapshot().presentation.lastCue === 'kill'
  ), { timeout: 10_000 });
  await pageA.keyboard.up('Space');
  await pageB.waitForFunction(() => {
    const current = window.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return current?.combat.snapshot?.players.find(({ playerId }) => (
      playerId === current.playerId
    ))?.lifePhase === 'dead';
  }, { timeout: 10_000 });
  const killA = await snapshot(pageA);
  const killB = await snapshot(pageB);
  const killDom = await presentationDom(pageA);
  await pageA.screenshot({
    path: path.join(screenshots, 'g4-03-confirmed-kill-hud-vfx.png'),
    fullPage: true,
  });
  await captureReadableBoard(pageA, 'g4-board-03-confirmed-kill.png');

  const teleportBefore = await snapshot(pageA);
  await pageA.locator('[data-testid="online-teleport"]').click();
  await pageA.waitForFunction(() => (
    window.__KYX_ONLINE_PREVIEW__?.getSnapshot().presentation.lastCue === 'teleport'
  ), { timeout: 10_000 });
  const teleportA = await snapshot(pageA);
  const teleportDom = await presentationDom(pageA);
  await pageA.screenshot({
    path: path.join(screenshots, 'g4-01-confirmed-teleport-hud-vfx.png'),
    fullPage: true,
  });
  await captureReadableBoard(pageA, 'g4-board-01-confirmed-teleport.png');

  const confirmedBeforeResume = teleportA.presentation.confirmedIntentCount;
  await pageA.locator('[data-testid="online-resume"]').click();
  await pageA.waitForFunction(() => {
    const current = window.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return current?.connection === 'joined'
      && current.presentation.hydrationCount >= 2
      && current.presentation.lastCue === 'snapshot';
  }, { timeout: 20_000 });
  await pageA.waitForFunction(() => (
    document.querySelector('[data-testid="online-confirmed-hud"]')?.dataset.audio === 'not_played'
      && document.querySelector('[data-testid="online-confirmed-vfx"]')?.dataset.active === 'false'
  ));
  const resumedA = await snapshot(pageA);
  const resumedDom = await presentationDom(pageA);
  await pageA.screenshot({
    path: path.join(screenshots, 'g4-04-reconnect-hydration-no-replay.png'),
    fullPage: true,
  });
  await captureReadableBoard(pageA, 'g4-board-04-reconnect-no-replay.png');

  const facts = {
    schemaVersion: 1,
    status: 'BOUNDED_G4_PRODUCT_PRESENTATION_BRIDGE_RUNTIME_PASS_G4_OPEN',
    capturedAt: new Date().toISOString(),
    browser: { executable: chrome, version: browserVersion, headless: true },
    services: { app: 'http://127.0.0.1:5173', authority: 'http://127.0.0.1:8787' },
    roomUrl,
    players: { a: initialA.playerId, b: initialB.playerId },
    initial: { a: initialA.presentation, b: initialB.presentation },
    body: { presentation: bodyA.presentation, dom: bodyDom },
    kill: {
      shooterPresentation: killA.presentation,
      victimPresentation: killB.presentation,
      shooterDom: killDom,
      victimLife: killB.combat.snapshot?.players.find(({ playerId }) => playerId === killB.playerId),
    },
    teleport: {
      beforePosition: teleportBefore.localPredictedPosition,
      afterPosition: teleportA.localPredictedPosition,
      presentation: teleportA.presentation,
      dom: teleportDom,
      reliableEvents: teleportA.combat.recentEvents.filter(({ presentation }) => (
        presentation?.kind.startsWith('teleport_') === true
      )),
    },
    reconnect: {
      presentation: resumedA.presentation,
      dom: resumedDom,
      confirmedBeforeResume,
      noConfirmedReplay: resumedA.presentation.confirmedIntentCount === confirmedBeforeResume,
      noDuplicateReplay: resumedA.presentation.duplicateAuthorityEvents === 0,
    },
    browserErrors,
    screenshots: {
      raw: [
        'screenshots/g4-01-confirmed-teleport-hud-vfx.png',
        'screenshots/g4-02-confirmed-body-hit-hud-vfx.png',
        'screenshots/g4-03-confirmed-kill-hud-vfx.png',
        'screenshots/g4-04-reconnect-hydration-no-replay.png',
      ],
      readableBoards: [
        'screenshots/g4-board-01-confirmed-teleport.png',
        'screenshots/g4-board-02-confirmed-body-hit.png',
        'screenshots/g4-board-03-confirmed-kill.png',
        'screenshots/g4-board-04-reconnect-no-replay.png',
      ],
    },
  };
  assert.equal(initialA.presentation.status, 'ready');
  assert.equal(initialB.presentation.status, 'ready');
  assert.equal(bodyA.presentation.lastCue, 'body');
  assert.equal(bodyA.presentation.duplicateAuthorityEvents, 0);
  assert.equal(bodyDom.hud.dataset.audio, 'played');
  assert.equal(killA.presentation.lastCue, 'kill');
  assert.equal(killA.presentation.duplicateAuthorityEvents, 0);
  assert.equal(killB.combat.snapshot?.players.find(({ playerId }) => playerId === killB.playerId)?.lifePhase, 'dead');
  assert.equal(teleportA.presentation.lastCue, 'teleport');
  assert.equal(teleportA.presentation.duplicateAuthorityEvents, 0);
  assert.deepEqual(teleportBefore.localPredictedPosition, { x: 0, y: 0, z: 0 });
  assert.deepEqual(teleportA.localPredictedPosition, { x: 0, y: 0, z: 9000 });
  assert.equal(facts.teleport.reliableEvents.length, 1);
  assert.equal(facts.teleport.reliableEvents[0]?.presentation?.kind, 'teleport_resource_confirmed');
  assert.equal(resumedA.presentation.hydrationCount, 2);
  assert.equal(facts.reconnect.noConfirmedReplay, true);
  assert.equal(facts.reconnect.noDuplicateReplay, true);
  assert.equal(resumedA.presentation.audioCueAttempts, teleportA.presentation.audioCueAttempts);
  assert.equal(resumedDom.hud.dataset.audio, 'not_played');
  assert.equal(resumedDom.vfx.active, 'false');
  assert.equal(resumedDom.vfx.cue, 'snapshot');
  assert.deepEqual(browserErrors, {
    consoleA: [], consoleB: [], pageA: [], pageB: [], requestA: [], requestB: [],
  });
  await writeFile(
    path.join(import.meta.dirname, 'runtime-facts.json'),
    `${JSON.stringify(facts, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
  await contextA.close();
  await contextB.close();
} finally {
  if (browser !== undefined) await browser.close().catch(() => {});
  for (const child of services.reverse()) child.kill();
  await writeFile(path.join(import.meta.dirname, 'service-logs.txt'), [
    '=== VITE ===', logs.vite.trim(), '', '=== WORKER ===', logs.worker.trim(), '',
  ].join('\n'), 'utf8');
}
