import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const PROFILE = 'p511-inkfall-foundry-revision-2-combat-v1';
const FLAT_COMBAT_PROFILE = 'p58d-rev3-combat-v1';
const PROFILE_HEADER = 'x-kyx-evidence-profile';
const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'http://127.0.0.1:8787';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(repo, process.argv[2] ?? 'evidence/2026-07-22/phase-5-p5-12/runtime-v6');
const screenshotDir = path.join(output, 'screenshots');
const videoDir = path.join(output, 'videos');
const temporaryVideoDir = path.join(output, '.video-staging');
const nodeExecutable = process.execPath;

const expectedBinding = Object.freeze({
  mapReference: 'inkfall_foundry@2',
  mapId: 'inkfall_foundry',
  mapRevision: 2,
  packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
});
const expectedSpawns = Object.freeze([
  Object.freeze({
    spawnId: 'spawn_w_press_a',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 0,
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_a',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 180_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_press_b',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 0,
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_b',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 180_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_ink',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -25_000,
  }),
  Object.freeze({
    spawnId: 'spawn_e_ink',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -155_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_archive',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 25_000,
  }),
  Object.freeze({
    spawnId: 'spawn_e_archive',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 155_000,
  }),
]);
const expectedIdentity = Object.freeze({
  mapId: 'inkfall_foundry',
  rulesetId: 'revamped_classic',
  rulesetRevision: 3,
  rulesetHash: 'd5f0418d1d927370',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  physicsAdapterId: 'rapier3d_deterministic_compat',
  physicsAdapterVersion: '0.19.3',
});
const westRoute = Object.freeze([
  Object.freeze({ x: -33_000, z: 0 }),
  Object.freeze({ x: -27_500, z: 1_000 }),
  Object.freeze({ x: -22_000, z: 0 }),
  Object.freeze({ x: -18_000, z: -1_500 }),
  Object.freeze({ x: -14_000, z: 2_000 }),
  Object.freeze({ x: -9_000, z: 4_500 }),
  Object.freeze({ x: -4_000, z: -2_500 }),
]);
const eastRoute = Object.freeze([
  Object.freeze({ x: 33_000, z: 0 }),
  Object.freeze({ x: 27_500, z: -1_000 }),
  Object.freeze({ x: 22_000, z: 0 }),
  Object.freeze({ x: 18_000, z: 1_500 }),
  Object.freeze({ x: 14_000, z: -2_000 }),
  Object.freeze({ x: 9_000, z: 4_500 }),
  Object.freeze({ x: 4_000, z: -2_500 }),
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function service(command, args, environment = process.env) {
  const lines = [];
  const child = spawn(command, args, {
    cwd: repo,
    env: environment,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const append = (chunk) => {
    lines.push(...String(chunk).split(/\r?\n/u).filter(Boolean));
    if (lines.length > 200) lines.splice(0, lines.length - 200);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  return { child, lines };
}

async function stopService(handle) {
  if (handle?.child.exitCode !== null) return;
  handle.child.kill();
  await Promise.race([
    new Promise((resolve) => handle.child.once('exit', resolve)),
    delay(3_000),
  ]);
  if (handle.child.exitCode === null) handle.child.kill('SIGKILL');
}

async function waitForHttp(url, timeoutMilliseconds = 30_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Keep polling while the local process binds its port.
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function snapshot(page) {
  return await page.evaluate(() => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null);
}

function normalizedYawDelta(from, to) {
  return ((to - from + 540_000) % 360_000) - 180_000;
}

async function face(page, targetYawMilliDegrees) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const current = await snapshot(page);
    assert.notEqual(current, null);
    const delta = normalizedYawDelta(
      current.localPredictedYawMilliDegrees,
      targetYawMilliDegrees,
    );
    if (Math.abs(delta) <= 2_200) return current;
    const key = delta > 0 ? 'e' : 'q';
    const duration = Math.max(70, Math.min(700, Math.abs(delta) / 30_000 * 1_000));
    await page.keyboard.down(key);
    await delay(duration);
    await page.keyboard.up(key);
    await delay(110);
  }
  throw new Error(`Failed to face ${targetYawMilliDegrees}`);
}

async function moveTo(page, target, label) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const current = await snapshot(page);
    assert.notEqual(current, null);
    const position = current.localPredictedPosition;
    assert.notEqual(position, null);
    if (position.y < -10_000) throw new Error(`${label} fell through at ${JSON.stringify(position)}`);
    const deltaX = target.x - position.x;
    const deltaZ = target.z - position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= 850) return current;
    await face(page, Math.round(Math.atan2(deltaX, deltaZ) * 180_000 / Math.PI));
    const duration = Math.max(100, Math.min(300, distance / 6_500 * 1_000));
    await page.keyboard.down('w');
    await delay(duration);
    await page.keyboard.up('w');
    await delay(120);
  }
  throw new Error(`${label} did not reach ${JSON.stringify(target)}`);
}

async function routePair(westPage, eastPage) {
  const checkpoints = [];
  for (let index = 0; index < westRoute.length; index += 1) {
    const [west, east] = await Promise.all([
      moveTo(westPage, westRoute[index], `west press-cross leg ${index}`),
      moveTo(eastPage, eastRoute[index], `east press-cross leg ${index}`),
    ]);
    checkpoints.push(Object.freeze({
      index,
      west: west.localPredictedPosition,
      east: east.localPredictedPosition,
    }));
  }
  return Object.freeze(checkpoints);
}

async function faceEachOther(westPage, eastPage) {
  const [west, east] = await Promise.all([snapshot(westPage), snapshot(eastPage)]);
  assert.notEqual(west?.localPredictedPosition, null);
  assert.notEqual(east?.localPredictedPosition, null);
  const westPosition = west.localPredictedPosition;
  const eastPosition = east.localPredictedPosition;
  const westYaw = Math.round(Math.atan2(
    eastPosition.x - westPosition.x,
    eastPosition.z - westPosition.z,
  ) * 180_000 / Math.PI);
  const eastYaw = Math.round(Math.atan2(
    westPosition.x - eastPosition.x,
    westPosition.z - eastPosition.z,
  ) * 180_000 / Math.PI);
  await Promise.all([face(westPage, westYaw), face(eastPage, eastYaw)]);
  await delay(180);
  return Object.freeze({ westYaw, eastYaw });
}

function localCombatPlayer(value) {
  return value.combat.snapshot.players.find(({ playerId }) => playerId === value.playerId);
}

function peerCombatPlayer(value) {
  return value.combat.snapshot.players.find(({ playerId }) => playerId !== value.playerId);
}

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function browserProcessId(browser) {
  try {
    const session = await browser.newBrowserCDPSession();
    const result = await session.send('SystemInfo.getProcessInfo');
    await session.detach();
    return result.processInfo.find(({ type }) => type === 'browser')?.id ?? null;
  } catch {
    return null;
  }
}

let vite = null;
let wrangler = null;
let westBrowser = null;
let eastBrowser = null;
let westContext = null;
let eastContext = null;

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output, { recursive: false });
await Promise.all([
  fs.mkdir(screenshotDir),
  fs.mkdir(videoDir),
  fs.mkdir(temporaryVideoDir),
]);

try {
  wrangler = service(nodeExecutable, [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--local',
    '--port',
    '8787',
  ]);
  vite = service(nodeExecutable, [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5173',
  ], { ...process.env, VITE_KYX_AUTHORITY_ORIGIN: AUTHORITY_ORIGIN });
  await Promise.all([
    waitForHttp(`${AUTHORITY_ORIGIN}/health`),
    waitForHttp(`${FRONTEND_ORIGIN}/online`),
  ]);

  const chromeCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  let chromeExecutable = null;
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      chromeExecutable = candidate;
      break;
    } catch {
      // Try the next installed system Chrome path.
    }
  }
  if (chromeExecutable === null) throw new Error('System Chrome was not found');

  westBrowser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
  eastBrowser = await chromium.launch({ executablePath: chromeExecutable, headless: true });
  const [westBrowserProcessId, eastBrowserProcessId] = await Promise.all([
    browserProcessId(westBrowser),
    browserProcessId(eastBrowser),
  ]);
  if (
    westBrowserProcessId !== null
    && eastBrowserProcessId !== null
    && westBrowserProcessId === eastBrowserProcessId
  ) throw new Error('The two browser launches resolved to one Chrome process');

  westContext = await westBrowser.newContext({
    viewport: { width: 1_440, height: 900 },
    recordVideo: { dir: temporaryVideoDir, size: { width: 1_440, height: 900 } },
  });
  eastContext = await eastBrowser.newContext({
    viewport: { width: 1_440, height: 900 },
    recordVideo: { dir: temporaryVideoDir, size: { width: 1_440, height: 900 } },
  });
  await westContext.addInitScript(() => localStorage.setItem(
    'kyx_local_profile',
    JSON.stringify({ kind: 'local_guest', version: 1, displayName: 'West Vanguard' }),
  ));
  await eastContext.addInitScript(() => localStorage.setItem(
    'kyx_local_profile',
    JSON.stringify({ kind: 'local_guest', version: 1, displayName: 'East Sentinel' }),
  ));
  const westPage = await westContext.newPage();
  const eastPage = await eastContext.newPage();
  const westVideo = westPage.video();
  const eastVideo = eastPage.video();
  const westConsoleErrors = [];
  const eastConsoleErrors = [];
  const westConsoleWarnings = [];
  const eastConsoleWarnings = [];
  westPage.on('console', (message) => {
    if (message.type() === 'error') westConsoleErrors.push(message.text());
    if (message.type() === 'warning') westConsoleWarnings.push(message.text());
  });
  eastPage.on('console', (message) => {
    if (message.type() === 'error') eastConsoleErrors.push(message.text());
    if (message.type() === 'warning') eastConsoleWarnings.push(message.text());
  });

  await westPage.goto(`${FRONTEND_ORIGIN}/online`, { waitUntil: 'networkidle' });
  const selector = westPage.getByTestId('online-inkfall-profile');
  assert.equal(await selector.isVisible(), true);
  assert.equal(await selector.isChecked(), false);
  await westPage.screenshot({
    path: path.join(screenshotDir, 'p512-01-visible-opt-in-selection.png'),
    fullPage: true,
  });
  await selector.check();
  await westPage.getByTestId('online-create-room').click();
  await westPage.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'joined',
    undefined,
    { timeout: 45_000 },
  );
  const joinUrl = westPage.url();
  assert.equal(new URL(joinUrl).searchParams.get('profile'), PROFILE);

  await eastPage.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    westPage.waitForFunction(
      () => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot().remotePlayers === 1,
      undefined,
      { timeout: 45_000 },
    ),
    eastPage.waitForFunction(
      () => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot().remotePlayers === 1,
      undefined,
      { timeout: 45_000 },
    ),
  ]);
  const [initialWest, initialEast] = await Promise.all([snapshot(westPage), snapshot(eastPage)]);
  assert.notEqual(initialWest, null);
  assert.notEqual(initialEast, null);
  assert.equal(initialWest.roomCode, initialEast.roomCode);
  assert.equal(initialWest.matchId, initialEast.matchId);
  assert.deepEqual(initialWest.localPredictedPosition, { x: -33_500, y: 0, z: -3_500 });
  assert.deepEqual(initialEast.localPredictedPosition, { x: 33_500, y: 0, z: 3_500 });
  for (const value of [initialWest, initialEast]) {
    assert.equal(value.roomVerification.roomProfile, PROFILE);
    assert.deepEqual(
      Object.fromEntries(Object.keys(expectedBinding).map((key) => [
        key,
        value.roomVerification.mapBinding[key],
      ])),
      expectedBinding,
    );
    assert.deepEqual(value.roomVerification.mapBinding.spawns, expectedSpawns);
    assert.deepEqual(
      Object.fromEntries(Object.keys(expectedIdentity).map((key) => [
        key,
        value.roomVerification.simulationIdentity[key],
      ])),
      expectedIdentity,
    );
    assert.ok(value.roomVerification.identityChecks >= 4);
    assert.equal(value.lastError, null);
  }
  await westPage.locator('main').screenshot({
    path: path.join(screenshotDir, 'p512-02-west-spawn-profile-identity.png'),
  });
  await eastPage.locator('main').screenshot({
    path: path.join(screenshotDir, 'p512-03-east-spawn-profile-identity.png'),
  });

  const routeCheckpoints = await routePair(westPage, eastPage);
  const crossAim = await faceEachOther(westPage, eastPage);
  const crossBefore = await snapshot(westPage);
  const crossVictimBefore = peerCombatPlayer(crossBefore);
  const crossShooterBefore = localCombatPlayer(crossBefore);
  await westPage.keyboard.down(' ');
  await delay(650);
  await westPage.keyboard.up(' ');
  await delay(350);
  const crossAfter = await snapshot(westPage);
  const crossVictimAfter = peerCombatPlayer(crossAfter);
  const crossShooterAfter = localCombatPlayer(crossAfter);
  assert.ok(crossShooterAfter.acceptedShotCount > crossShooterBefore.acceptedShotCount);
  assert.equal(crossVictimAfter.healthPoints, crossVictimBefore.healthPoints);
  assert.equal(crossAfter.lastError, null);
  await westPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-04-real-occlusion-blocks-cross-map-fire.png'),
  });

  await westPage.keyboard.down('r');
  await delay(250);
  await westPage.keyboard.up('r');
  await westPage.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(({ playerId }) => playerId === value.playerId);
    return local?.magazineRounds === 50 && local.reserveRounds < 150;
  }, undefined, { timeout: 8_000 });

  await Promise.all([
    moveTo(westPage, { x: -1_200, z: 0 }, 'west close engagement'),
    moveTo(eastPage, { x: 1_200, z: 0 }, 'east close engagement'),
  ]);
  const closeAim = await faceEachOther(westPage, eastPage);
  await westPage.keyboard.down(' ');
  await eastPage.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(({ playerId }) => playerId === value.playerId);
    return local !== undefined && local.healthPoints <= 70;
  }, undefined, { timeout: 10_000 });
  await westPage.keyboard.up(' ');
  await delay(180);
  const [damageWest, damageEast] = await Promise.all([snapshot(westPage), snapshot(eastPage)]);
  assert.ok(localCombatPlayer(damageEast).healthPoints <= 70);
  assert.ok(damageWest.combat.recentEvents.some(({ kind }) => kind === 'damageApplied'));
  await westPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-05-west-authoritative-damage.png'),
  });
  await eastPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-06-east-authoritative-damage.png'),
  });

  await westPage.keyboard.down(' ');
  await eastPage.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(({ playerId }) => playerId === value.playerId);
    return local?.lifePhase === 'dead';
  }, undefined, { timeout: 5_000 });
  await westPage.keyboard.up(' ');
  await delay(180);
  const [deathWest, deathEast] = await Promise.all([snapshot(westPage), snapshot(eastPage)]);
  const victimAtDeath = localCombatPlayer(deathEast);
  assert.deepEqual(
    { lifePhase: victimAtDeath.lifePhase, healthPoints: victimAtDeath.healthPoints },
    { lifePhase: 'dead', healthPoints: 0 },
  );
  assert.ok(deathWest.combat.recentEvents.some(({ kind }) => kind === 'playerKilled'));
  assert.ok(deathWest.combat.snapshot.match.feedSequence >= 1);
  await westPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-07-west-authoritative-kill.png'),
  });
  await eastPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-08-east-authoritative-death.png'),
  });

  await westPage.keyboard.down('g');
  await delay(120);
  await westPage.keyboard.up('g');
  await westPage.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(({ playerId }) => playerId === value.playerId);
    return local !== undefined
      && local.acceptedThrowCount >= 1
      && local.activeProjectileCount >= 1;
  }, undefined, { timeout: 5_000 });
  const grenadeWest = await snapshot(westPage);
  assert.equal(grenadeWest.lastError, null);
  await westPage.getByTestId('online-arena').screenshot({
    path: path.join(screenshotDir, 'p512-09-real-grenade-port-active.png'),
  });

  assert.deepEqual(westConsoleErrors, []);
  assert.deepEqual(eastConsoleErrors, []);

  const flatResponse = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: FRONTEND_ORIGIN, [PROFILE_HEADER]: FLAT_COMBAT_PROFILE },
  });
  assert.equal(flatResponse.status, 201);
  const flatRoom = await flatResponse.json();
  await westPage.goto(
    `${FRONTEND_ORIGIN}/online?mode=join&room=${flatRoom.roomCode}&profile=${PROFILE}`,
    { waitUntil: 'domcontentloaded' },
  );
  await westPage.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'room-profile-mismatch',
    undefined,
    { timeout: 15_000 },
  );
  assert.equal(await westPage.evaluate(() => globalThis.__KYX_ONLINE_PREVIEW__), undefined);
  const mismatchCopy = await westPage.locator('.online-preview__notice').innerText();
  assert.match(mismatchCopy, /HTTP 409/u);
  await westPage.screenshot({
    path: path.join(screenshotDir, 'p512-10-profile-mismatch-fails-closed.png'),
    fullPage: true,
  });

  assert.deepEqual(eastConsoleErrors, []);
  assert.equal(westConsoleErrors.length, 1);
  assert.match(westConsoleErrors[0], /Failed to load resource.*409 \(Conflict\)/u);
  await Promise.all([westContext.close(), eastContext.close()]);
  westContext = null;
  eastContext = null;
  const westVideoPath = await westVideo.path();
  const eastVideoPath = await eastVideo.path();
  const finalWestVideo = path.join(videoDir, 'p512-west-product-client.webm');
  const finalEastVideo = path.join(videoDir, 'p512-east-product-client.webm');
  await Promise.all([
    fs.rename(westVideoPath, finalWestVideo),
    fs.rename(eastVideoPath, finalEastVideo),
  ]);
  await Promise.all([westBrowser.close(), eastBrowser.close()]);
  westBrowser = null;
  eastBrowser = null;
  await fs.rm(temporaryVideoDir, { recursive: true });

  const selectedFiles = [
    ...((await fs.readdir(screenshotDir)).map((name) => `screenshots/${name}`)),
    'videos/p512-west-product-client.webm',
    'videos/p512-east-product-client.webm',
  ].sort();
  const selectedArtifactsSha256 = Object.fromEntries(await Promise.all(selectedFiles.map(
    async (relative) => [relative, await sha256(path.join(output, relative))],
  )));
  const sourceFiles = [
    'src/app/onlineAuthorityProfiles.ts',
    'src/app/onlineAuthoritySelection.ts',
    'src/app/onlineAuthorityGateway.ts',
    'src/app/onlineAuthorityInkfallWorld.ts',
    'src/app/onlineAuthorityRoute.ts',
    'src/dev/authorityEvidenceModel.ts',
    'src/dev/authorityEvidenceClient.ts',
    'src/authority/combat/rewindHitscan.ts',
    'worker/worker.ts',
    'tools/evidence/capture-phase5-p512-inkfall-product-client.mjs',
  ];
  const sourceSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(
    async (relative) => [relative, await sha256(path.join(repo, relative))],
  )));
  const proof = Object.freeze({
    schemaVersion: 1,
    phase: 'P5.12',
    capturedAt: new Date().toISOString(),
    status: 'BOUNDED_PASS',
    gateClaim: 'G4_NOT_CLAIMED_G5_NOT_CLAIMED',
    topology: {
      route: '/online',
      frontendOrigin: FRONTEND_ORIGIN,
      authorityOrigin: AUTHORITY_ORIGIN,
      browserLaunches: 2,
      browserProcesses: 2,
      westBrowserProcessId,
      eastBrowserProcessId,
      executable: chromeExecutable,
      headless: true,
      syntheticDashboard: false,
    },
    selection: {
      visibleUncheckedByDefault: true,
      explicitProfile: PROFILE,
      joinUrl,
      profileSentOnCreateAndJoinMetadataCheck: true,
      mismatchFailsClosedBeforeSocket: true,
      mismatchCopy,
      expectedMismatchConsoleError: westConsoleErrors[0],
    },
    lockedAuthority: {
      roomCode: initialWest.roomCode,
      matchId: initialWest.matchId,
      roomProfile: initialWest.roomVerification.roomProfile,
      mapBinding: initialWest.roomVerification.mapBinding,
      simulationIdentity: initialWest.roomVerification.simulationIdentity,
      westIdentityChecks: initialWest.roomVerification.identityChecks,
      eastIdentityChecks: initialEast.roomVerification.identityChecks,
    },
    spawns: {
      west: initialWest.localPredictedPosition,
      east: initialEast.localPredictedPosition,
      westPlayerId: initialWest.playerId,
      eastPlayerId: initialEast.playerId,
    },
    pressCross: {
      routeId: 'synthetic_2_player_press_cross',
      westRoute,
      eastRoute,
      observedCheckpoints: routeCheckpoints,
      crossAim,
      acceptedShotsBefore: crossShooterBefore.acceptedShotCount,
      acceptedShotsAfter: crossShooterAfter.acceptedShotCount,
      victimHealthBefore: crossVictimBefore.healthPoints,
      victimHealthAfter: crossVictimAfter.healthPoints,
      realOcclusionBlockedCrossMapDamage: true,
    },
    closeCombat: {
      aim: closeAim,
      damageHealth: localCombatPlayer(damageEast).healthPoints,
      death: {
        lifePhase: victimAtDeath.lifePhase,
        healthPoints: victimAtDeath.healthPoints,
        deathOrdinal: victimAtDeath.deathOrdinal,
        feedSequence: deathWest.combat.snapshot.match.feedSequence,
        teamScores: deathWest.combat.snapshot.match.teamScores,
      },
      damageEventObserved: true,
      killEventObserved: true,
      grenade: {
        localPlayer: localCombatPlayer(grenadeWest),
        projectiles: grenadeWest.combat.snapshot.projectiles,
      },
      clientErrors: [deathWest.lastError, deathEast.lastError, grenadeWest.lastError],
    },
    browserConsole: {
      errors: { west: westConsoleErrors, east: eastConsoleErrors },
      warnings: { west: westConsoleWarnings, east: eastConsoleWarnings },
    },
    discoveredAndFixedDuringSlice: {
      symptom: 'Non-cardinal muzzle rotation produced a fractional world-ray origin rejected by the strict Inkfall port.',
      correction: 'Authority-derived eye and muzzle origins are deterministically rounded to integer millimeters before ray construction.',
      regressionTest: 'tests/unit/authority/combat/rewindHitscan.test.ts',
    },
    knownLimits: [
      'The full active-match checkpoint and final traversal matrix remain open.',
      'The final integrated visual map and human visual acceptance remain open.',
      'This capture does not close G4 or G5.',
    ],
    selectedArtifactsSha256,
    sourceSha256,
  });
  const proofFile = path.join(output, 'p512-two-browser-inkfall-product-client-proof.json');
  await fs.writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
  const manifest = {
    schemaVersion: 1,
    files: {
      ...selectedArtifactsSha256,
      'p512-two-browser-inkfall-product-client-proof.json': await sha256(proofFile),
    },
  };
  await fs.writeFile(
    path.join(output, 'artifact-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`${JSON.stringify({ output, roomCode: initialWest.roomCode, manifest }, null, 2)}\n`);
} catch (error) {
  await fs.writeFile(path.join(output, 'capture-failure.json'), `${JSON.stringify({
    capturedAt: new Date().toISOString(),
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
    vite: vite?.lines ?? [],
    wrangler: wrangler?.lines ?? [],
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await Promise.allSettled([
    westContext?.close(),
    eastContext?.close(),
    westBrowser?.close(),
    eastBrowser?.close(),
  ]);
  await Promise.allSettled([stopService(vite), stopService(wrangler)]);
}
