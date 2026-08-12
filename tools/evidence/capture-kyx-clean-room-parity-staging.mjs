import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredOption(name) {
  const value = option(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const baseUrl = new URL(requiredOption('--base-url'));
const output = path.resolve(requiredOption('--output'));
const expectedBuildId = requiredOption('--expected-build-id');
const chromeExecutable = option('--chrome')
  ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (baseUrl.protocol !== 'https:') {
  throw new Error('Staging capture requires an HTTPS base URL');
}

await fs.access(output).then(
  () => { throw new Error(`Output already exists: ${output}`); },
  (error) => {
    if (error?.code !== 'ENOENT') throw error;
  },
);
await fs.mkdir(output, { recursive: true });

const arenaCases = Object.freeze([
  Object.freeze({
    id: 'relay',
    profile: 'relay-revision-1-authority-v1',
    mapReference: 'relay@1',
    displayName: 'Relay',
  }),
  Object.freeze({
    id: 'switchyard',
    profile: 'switchyard-revision-1-authority-v1',
    mapReference: 'switchyard@1',
    displayName: 'Switchyard',
  }),
  Object.freeze({
    id: 'crownpoint',
    profile: 'crownpoint-revision-1-authority-v1',
    mapReference: 'crownpoint@1',
    displayName: 'Crownpoint',
  }),
]);

const runtimeErrors = { console: [], page: [], requests: [] };
const captures = [];
const arenas = [];
let health = null;
let failure = null;
let browser = null;

function pageUrl(route) {
  return new URL(route, baseUrl).toString();
}

async function sha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function capture(page, file, notes) {
  await page.waitForTimeout(300);
  const target = path.join(output, file);
  await page.screenshot({ path: target, fullPage: false });
  const stat = await fs.stat(target);
  captures.push({
    file,
    bytes: stat.size,
    sha256: await sha256(target),
    viewport: page.viewportSize(),
    url: page.url(),
    notes,
  });
}

function observePage(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.console.push(`[${label}] ${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.page.push(`[${label}] ${error.message}`));
  page.on('requestfailed', (request) => {
    const failureText = request.failure()?.errorText ?? 'failed';
    if (failureText === 'net::ERR_ABORTED' && request.isNavigationRequest()) return;
    runtimeErrors.requests.push(
      `[${label}] ${request.method()} ${request.url()}: ${failureText}`,
    );
  });
}

async function snapshot(page) {
  return page.evaluate(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const localPlayer = value?.combat?.snapshot?.players?.find(
      (player) => player.playerId === value.playerId,
    );
    return {
      connection: value?.connection ?? null,
      roomCode: value?.roomCode ?? null,
      playerId: value?.playerId ?? null,
      remotePlayers: value?.remotePlayers ?? null,
      commandsGenerated: value?.commandsGenerated ?? null,
      selectedWeaponSlot: value?.inputBridge?.selectedWeaponSlot ?? null,
      mapReference: value?.render3d?.mapReference ?? null,
      presentationReference: value?.render3d?.presentationReference ?? null,
      renderer: value?.render3d?.renderer ?? null,
      renderStatus: value?.render3d?.status ?? null,
      matchPhase: value?.combat?.snapshot?.match?.phase ?? null,
      teamScores: value?.combat?.snapshot?.match?.teamScores ?? null,
      serverTick: value?.authority?.serverTick ?? null,
      authoritativePosition: value?.localAuthoritativePosition ?? null,
      predictedPosition: value?.localPredictedPosition ?? null,
      authoritativeVelocity: value?.localAuthoritativeVelocity ?? null,
      predictionErrorMillimeters: value?.localPredictionErrorMillimeters ?? null,
      health: localPlayer?.health ?? null,
      lifePhase: localPlayer?.lifePhase ?? null,
      weapon: localPlayer?.weapon ?? null,
      abilityLoadout: localPlayer?.abilityLoadout ?? null,
      recentEvents: value?.combat?.recentEvents?.slice(-12) ?? [],
      body: {
        status: document.body.dataset.onlinePreviewStatus ?? null,
        mapReference: document.body.dataset.onlineMapReference ?? null,
        threeStatus: document.body.dataset.online3dStatus ?? null,
        presentationMode: document.body.dataset.online3dPresentationMode ?? null,
        displayName: document.body.dataset.online3dDisplayName ?? null,
      },
    };
  });
}

async function waitForJoined(page, arena) {
  await page.waitForFunction(({ mapReference, displayName }) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.connection === 'joined'
      && value?.remotePlayers === 7
      && value?.render3d?.status === 'ready'
      && value?.render3d?.mapReference === mapReference
      && document.body.dataset.online3dStatus === 'ready'
      && document.body.dataset.onlineMapReference === mapReference
      && document.body.dataset.online3dDisplayName === displayName;
  }, arena, { timeout: 60_000 });
}

async function proveMovement(page, arenaId) {
  const canvas = page.getByTestId('online-arena');
  await canvas.focus();
  const before = await snapshot(page);
  if (before.authoritativePosition === null || before.commandsGenerated === null) {
    throw new Error(`${arenaId} did not expose authoritative movement state`);
  }
  await page.keyboard.down('KeyW');
  try {
    await page.waitForFunction(({ origin, commands }) => {
      const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      const position = value?.localAuthoritativePosition;
      return position !== null && position !== undefined
        && Number(value?.commandsGenerated) >= commands + 5
        && Math.hypot(position.x - origin.x, position.z - origin.z) >= 250;
    }, {
      origin: before.authoritativePosition,
      commands: before.commandsGenerated,
    }, { timeout: 12_000 });
  } finally {
    await page.keyboard.up('KeyW');
  }
  await page.waitForTimeout(250);
  const after = await snapshot(page);
  return {
    before,
    after,
    distanceMillimeters: Math.hypot(
      after.authoritativePosition.x - before.authoritativePosition.x,
      after.authoritativePosition.z - before.authoritativePosition.z,
    ),
    commandsGenerated: after.commandsGenerated - before.commandsGenerated,
  };
}

async function proveRelayCombatControls(page) {
  const canvas = page.getByTestId('online-arena');
  await canvas.focus();
  const weaponSlots = [];
  for (let slot = 0; slot < 6; slot += 1) {
    await page.keyboard.press(`Digit${slot + 1}`);
    await page.waitForFunction((expectedSlot) => (
      globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()?.inputBridge?.selectedWeaponSlot
      === expectedSlot
    ), slot, { timeout: 5_000 });
    weaponSlots.push((await snapshot(page)).selectedWeaponSlot);
  }
  await page.keyboard.press('Digit1');
  const before = await snapshot(page);
  await page.keyboard.down('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.up('Enter');
  await page.getByTestId('online-ability-one').click();
  await page.waitForTimeout(700);
  const after = await snapshot(page);
  return { before, after, weaponSlots };
}

try {
  const healthResponse = await fetch(pageUrl('/health'));
  if (!healthResponse.ok) throw new Error(`Staging health failed with ${healthResponse.status}`);
  health = await healthResponse.json();
  if (health?.buildId !== expectedBuildId) {
    throw new Error(
      `Staging build mismatch: expected ${expectedBuildId}, received ${health?.buildId ?? 'missing'}`,
    );
  }

  browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({ kind: 'local_guest', version: 1, displayName: 'Parity Reviewer' }),
    );
  });

  const home = await context.newPage();
  observePage(home, 'home');
  await home.goto(baseUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await home.getByRole('button', { name: /quick match/i }).waitFor({ timeout: 30_000 });
  await capture(home, '01-home-1440x900.png', 'Source-matched staging home before entering play.');

  for (const [index, arena] of arenaCases.entries()) {
    const page = await context.newPage();
    observePage(page, arena.id);
    await page.goto(
      pageUrl(`/online?mode=create&profile=${encodeURIComponent(arena.profile)}`),
      { waitUntil: 'domcontentloaded', timeout: 45_000 },
    );
    await waitForJoined(page, arena);
    const joined = await snapshot(page);
    await capture(
      page,
      `${index + 2}-${arena.id}-active-1440x900.png`,
      `${arena.displayName} active with one human slot and seven authority bots.`,
    );
    const movement = await proveMovement(page, arena.id);
    let controls = null;
    if (arena.id === 'relay') {
      controls = await proveRelayCombatControls(page);
      await capture(
        page,
        '03-relay-combat-controls-1440x900.png',
        'Relay after all six weapon slots, one fire hold, and Ability 1 input.',
      );
      const canvas = page.getByTestId('online-arena');
      await canvas.focus();
      await page.keyboard.down('Tab');
      await page.getByTestId('online-scoreboard').waitFor({ state: 'visible' });
      await page.waitForFunction(() => (
        document.querySelector('[data-testid="online-scoreboard"]')?.getAttribute('data-open')
        === 'true'
      ));
      await capture(
        page,
        '04-relay-scoreboard-1440x900.png',
        'Authority-owned eight-player scoreboard while the live match remains active.',
      );
      await page.keyboard.up('Tab');
    }
    arenas.push({ arena, joined, movement, controls, final: await snapshot(page) });
  }
} catch (cause) {
  failure = cause instanceof Error ? cause.stack ?? cause.message : String(cause);
} finally {
  await browser?.close().catch(() => {});
}

const runtime = {
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  baseUrl: baseUrl.toString(),
  expectedBuildId,
  chromeExecutable,
  health,
  captures,
  arenas,
  runtimeErrors,
  pointerLockUsed: false,
  pointerLockNonclaim: 'Keyboard gameplay was exercised with canvas focus; native pointer lock was not automated.',
  failure,
};
const runtimePath = path.join(output, failure === null ? 'runtime.json' : 'runtime.partial.json');
await fs.writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');

if (failure !== null) throw new Error(failure);
if (
  runtimeErrors.console.length > 0
  || runtimeErrors.page.length > 0
  || runtimeErrors.requests.length > 0
) {
  throw new Error(`Staging capture recorded runtime errors: ${JSON.stringify(runtimeErrors)}`);
}
if (arenas.length !== arenaCases.length) {
  throw new Error(`Expected ${arenaCases.length} arena proofs, received ${arenas.length}`);
}

console.log(`Captured ${captures.length} source-matched staging views to ${output}`);
