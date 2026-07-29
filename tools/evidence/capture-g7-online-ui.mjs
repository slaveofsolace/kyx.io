import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const command = promisify(execFile);

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const frontendPort = Number(option('--frontend-port', '6308'));
const authorityPort = Number(option('--authority-port', '8308'));
const output = path.resolve(option(
  '--output',
  'evidence/2026-07-29/g7-immersive-hud-revamp/after/online-source-matched-6308-8308',
));
const browserChannel = option('--channel', 'chrome');
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const authorityOrigin = `http://127.0.0.1:${authorityPort}`;
const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

for (const port of [frontendPort, authorityPort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Frontend and authority ports must be valid integers.');
  }
  if (port === 5_173 || port === 8_787) {
    throw new Error(`Port ${port} is reserved by the coordinated G3 capture.`);
  }
}

function service(args, environment = process.env) {
  const lines = [];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk) => {
    lines.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
    if (lines.length > 300) lines.splice(0, lines.length - 300);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  return { child, lines };
}

async function stopService(handle) {
  if (handle === null || handle.child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await command(
      'taskkill.exe',
      ['/PID', String(handle.child.pid), '/T', '/F'],
      { windowsHide: true },
    ).catch(() => {});
    return;
  }
  handle.child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => handle.child.once('exit', resolve)),
    delay(3_000),
  ]);
  if (handle.child.exitCode === null) handle.child.kill('SIGKILL');
}

async function waitForHttp(url, timeoutMilliseconds = 45_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The local service is still binding.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

await fs.mkdir(output, { recursive: true });

const runtimeErrors = {
  console: [],
  page: [],
  requests: [],
};
const captures = [];
const services = { vite: null, wrangler: null };
let browser = null;
let joinedSummary = null;
let peerSummary = null;
let cooldownProof = null;
const authorityInputProof = [];
let failure = null;

async function capture(page, name, notes = null) {
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(output, name),
    fullPage: false,
  });
  captures.push({
    file: name,
    viewport: page.viewportSize(),
    url: page.url(),
    notes,
  });
}

try {
  services.wrangler = service([
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--local',
    '--port',
    String(authorityPort),
    '--var',
    `ALLOWED_ORIGINS:${frontendOrigin}`,
  ]);
  services.vite = service(
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(frontendPort),
      '--strictPort',
    ],
    {
      ...process.env,
      VITE_KYX_AUTHORITY_ORIGIN: authorityOrigin,
    },
  );
  await Promise.all([
    waitForHttp(`${authorityOrigin}/health`),
    waitForHttp(`${frontendOrigin}/online`),
  ]);

  browser = await chromium.launch({ channel: browserChannel, headless: true });
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({ kind: 'local_guest', version: 1, displayName: 'G7 Reviewer' }),
    );
  });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.console.push(message.text());
  });
  page.on('pageerror', (error) => runtimeErrors.page.push(error.message));
  page.on('requestfailed', (request) => {
    runtimeErrors.requests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });

  await page.goto(`${frontendOrigin}/online`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="online-preview-route"]').waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await capture(page, 'online-lobby-configured-1440x900.png');
  await page.locator('[data-testid="online-create-room"]').click();
  await page.waitForFunction(() => (
    document.body.dataset.onlinePreviewStatus === 'joined'
    && document.body.dataset.online3dStatus === 'ready'
    && globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()?.connection === 'joined'
  ), null, { timeout: 90_000 });

  const peerContext = await browser.newContext({ viewport: { width: 1_280, height: 720 } });
  await peerContext.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({ kind: 'local_guest', version: 1, displayName: 'G7 Capture Peer' }),
    );
  });
  const peerPage = await peerContext.newPage();
  peerPage.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.console.push(`[peer] ${message.text()}`);
  });
  peerPage.on('pageerror', (error) => runtimeErrors.page.push(`[peer] ${error.message}`));
  peerPage.on('requestfailed', (request) => {
    runtimeErrors.requests.push(
      `[peer] ${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  await peerPage.goto(page.url(), { waitUntil: 'networkidle' });
  await peerPage.waitForFunction(() => (
    globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()?.connection === 'joined'
  ), null, { timeout: 90_000 });
  await page.bringToFront();
  await page.waitForTimeout(4_000);

  joinedSummary = await page.evaluate(() => {
    const snapshot = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return {
      connection: snapshot?.connection ?? null,
      roomCode: snapshot?.roomCode ?? null,
      playerId: snapshot?.playerId ?? null,
      remotePlayers: snapshot?.remotePlayers ?? null,
      render3dStatus: snapshot?.render3d?.status ?? null,
      renderer: snapshot?.render3d?.renderer ?? null,
      mapReference: snapshot?.render3d?.mapReference ?? null,
      presentationReference: snapshot?.render3d?.presentationReference ?? null,
      matchPhase: snapshot?.combat?.snapshot?.match?.phase ?? null,
      onlinePreviewStatus: document.body.dataset.onlinePreviewStatus ?? null,
      online3dStatus: document.body.dataset.online3dStatus ?? null,
    };
  });
  peerSummary = await peerPage.evaluate(() => {
    const snapshot = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return {
      connection: snapshot?.connection ?? null,
      roomCode: snapshot?.roomCode ?? null,
      playerId: snapshot?.playerId ?? null,
      remotePlayers: snapshot?.remotePlayers ?? null,
      matchPhase: snapshot?.combat?.snapshot?.match?.phase ?? null,
    };
  });

  await page.setViewportSize({ width: 1_280, height: 720 });
  await capture(page, 'online-hud-1280x720.png');

  const cooldownAbility = page.locator('[data-testid="online-ability-three"]');
  const gameplayCanvas = page.locator('.online-session__canvas-wrap canvas').first();
  await gameplayCanvas.focus();
  for (let activation = 0; activation < 2; activation += 1) {
    await page.keyboard.down('z');
    await page.waitForTimeout(250);
    authorityInputProof.push(await page.evaluate((activationIndex) => {
      const snapshot = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      const localPlayer = snapshot?.combat?.snapshot?.players?.find(
        (player) => player.playerId === snapshot.playerId,
      );
      return {
        activation: activationIndex + 1,
        stage: 'held',
        heldButtons: snapshot?.inputBridge?.heldButtons ?? null,
        matchPhase: snapshot?.combat?.snapshot?.match?.phase ?? null,
        currentCharges: localPlayer?.abilityLoadout?.currentCharges ?? null,
        acceptedActivationCounts: localPlayer?.abilityLoadout?.acceptedActivationCounts ?? null,
      };
    }, activation));
    await page.keyboard.up('z');
    await page.waitForTimeout(500);
    authorityInputProof.push(await page.evaluate((activationIndex) => {
      const snapshot = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      const localPlayer = snapshot?.combat?.snapshot?.players?.find(
        (player) => player.playerId === snapshot.playerId,
      );
      const abilityElement = document.querySelector('[data-testid="online-ability-three"]');
      return {
        activation: activationIndex + 1,
        stage: 'released',
        heldButtons: snapshot?.inputBridge?.heldButtons ?? null,
        matchPhase: snapshot?.combat?.snapshot?.match?.phase ?? null,
        currentCharges: localPlayer?.abilityLoadout?.currentCharges ?? null,
        acceptedActivationCounts: localPlayer?.abilityLoadout?.acceptedActivationCounts ?? null,
        hudState: abilityElement?.getAttribute('data-state') ?? null,
        readinessPercent: Number(abilityElement?.getAttribute('data-readiness-percent')),
        fillTransform:
          abilityElement?.querySelector('.ability-progress__fill')?.style.transform ?? null,
      };
    }, activation));
  }
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="online-ability-three"]');
    const percent = Number(element?.getAttribute('data-readiness-percent'));
    return element?.getAttribute('data-state') === 'charging'
      && Number.isFinite(percent)
      && percent > 0
      && percent < 100;
  }, null, { timeout: 15_000 });
  cooldownProof = await cooldownAbility.evaluate((element) => ({
    abilityId: element.dataset.abilityId,
    state: element.dataset.state,
    readinessPercent: Number(element.dataset.readinessPercent),
    rechargeSeconds: Number(element.dataset.rechargeSeconds),
    fillTransform: element.querySelector('.ability-progress__fill')?.style.transform ?? null,
  }));
  await capture(
    page,
    'online-hud-ability-cooldown-1280x720.png',
    'Real two-player local authority room after exhausting the Frag charges; readiness is between empty and ready.',
  );

  await gameplayCanvas.focus();
  await page.keyboard.down('Tab');
  await page.locator('[data-testid="online-scoreboard"][data-open="true"]').waitFor({
    state: 'visible',
  });
  await capture(page, 'online-scoreboard-1280x720.png');
  await page.keyboard.up('Tab');

  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await capture(page, 'online-hud-1920x1080.png');
  await page.setViewportSize({ width: 3_440, height: 1_440 });
  await capture(page, 'online-hud-ultrawide-3440x1440.png');
} catch (cause) {
  failure = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
} finally {
  await browser?.close().catch(() => {});
  await Promise.all([
    stopService(services.vite),
    stopService(services.wrangler),
  ]);
}

const manifest = {
  capturedAt: new Date().toISOString(),
  frontendOrigin,
  authorityOrigin,
  prohibitedPortsUntouched: [5_173, 8_787],
  browserChannel,
  captures,
  joinedSummary,
  peerSummary,
  cooldownProof,
  authorityInputProof,
  runtimeErrors,
  serviceLogs: {
    vite: services.vite?.lines ?? [],
    wrangler: services.wrangler?.lines ?? [],
  },
  failure,
};
await fs.writeFile(
  path.join(output, 'runtime-capture.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

if (failure !== null) throw new Error(failure);
if (
  runtimeErrors.console.length > 0
  || runtimeErrors.page.length > 0
  || runtimeErrors.requests.length > 0
) {
  throw new Error(`Online capture recorded runtime errors: ${JSON.stringify(runtimeErrors)}`);
}

console.log(`Captured ${captures.length} configured-online G7 views to ${output}`);
