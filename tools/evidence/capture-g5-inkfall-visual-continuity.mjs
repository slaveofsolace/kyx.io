import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const PROFILE = 'g5-inkfall-foundry-rev4-revision-3-authority-v1';
const MAP_REFERENCE = 'inkfall_foundry@3';
const FIXTURE_HASH = '97eb7772ac59dc95';
const PRESENTATION_REFERENCE =
  'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular';
const PRESENTATION_SHA256 =
  'e48b0b16083da337c71ed9ba8af3a244a0d5b613e0dcaed13857ba8f89cd4ae2';
const FRONTEND_PORT = 6_247;
const AUTHORITY_PORT = 8_947;
const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const commandArguments = process.argv.slice(2);
const outputArgument = commandArguments.find((argument) => !argument.startsWith('--'));
const rendererArgument = commandArguments.find((argument) => (
  argument.startsWith('--renderer=')
));
const rendererMode = rendererArgument?.slice('--renderer='.length) ?? 'hardware';
assert.ok(
  rendererMode === 'hardware' || rendererMode === 'swiftshader',
  `Unsupported renderer mode: ${rendererMode}`,
);
const output = path.resolve(
  repo,
  outputArgument
    ?? 'evidence/2026-07-29/g5-inkfall-rev5-player-eye-v1',
);
const screenshots = path.join(output, 'screenshots');
const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function service(args, environment = process.env) {
  const lines = [];
  const child = spawn(process.execPath, args, {
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
  if (handle === null || handle.child.exitCode !== null) return;
  handle.child.kill();
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

async function snapshot(page) {
  return await page.evaluate(
    () => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null,
  );
}

async function captureArena(page, filename) {
  await page.locator('.online-session__canvas-wrap').screenshot({
    path: path.join(screenshots, filename),
  });
}

async function tapLook(page, code, count) {
  await page.keyboard.down(code);
  await delay(Math.max(80, count * 55));
  await page.keyboard.up(code);
  await delay(350);
}

function angularDistanceMilliDegrees(left, right) {
  const delta = Math.abs(left - right) % 360_000;
  return Math.min(delta, 360_000 - delta);
}

function signedAngularDeltaMilliDegrees(target, current) {
  return ((target - current + 540_000) % 360_000) - 180_000;
}

function headingToMapTarget(position, target) {
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  return (
    Math.atan2(deltaX, deltaZ) * 180_000 / Math.PI
    + 360_000
  ) % 360_000;
}

async function rotateToYaw(page, targetYawMilliDegrees) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = await snapshot(page);
    assert.notEqual(value?.localPredictedYawMilliDegrees, null);
    const delta = signedAngularDeltaMilliDegrees(
      targetYawMilliDegrees,
      value.localPredictedYawMilliDegrees,
    );
    if (Math.abs(delta) <= 4_500) return value;
    const count = Math.max(1, Math.min(24, Math.ceil(Math.abs(delta) / 1_700)));
    await tapLook(page, delta > 0 ? 'ArrowRight' : 'ArrowLeft', count);
  }
  const value = await snapshot(page);
  throw new Error(
    `Unable to rotate to ${targetYawMilliDegrees}: ${
      value?.localPredictedYawMilliDegrees ?? 'missing yaw'
    }`,
  );
}

async function navigateToMapTarget(
  page,
  target,
  label,
  arrivalToleranceMillimeters = 850,
) {
  const route = [];
  let bestDistance = Number.POSITIVE_INFINITY;
  let stalledPulses = 0;
  for (let pulse = 0; pulse < 48; pulse += 1) {
    const before = await snapshot(page);
    assert.notEqual(before?.localAuthoritativePosition, null);
    const deltaX = target.x - before.localAuthoritativePosition.x;
    const deltaZ = target.z - before.localAuthoritativePosition.z;
    const distance = Math.hypot(deltaX, deltaZ);
    route.push({
      pulse,
      position: before.localAuthoritativePosition,
      distance,
      yawMilliDegrees: before.localPredictedYawMilliDegrees,
    });
    if (distance <= arrivalToleranceMillimeters) {
      return Object.freeze({ route: Object.freeze(route), snapshot: before });
    }
    const nearTargetConvergenceBandMillimeters =
      arrivalToleranceMillimeters + 500;
    if (
      distance <= nearTargetConvergenceBandMillimeters
      || distance <= bestDistance - 120
    ) {
      bestDistance = Math.min(bestDistance, distance);
      stalledPulses = 0;
    } else {
      stalledPulses += 1;
    }
    if (stalledPulses >= 3) {
      const yawRadians =
        before.localPredictedYawMilliDegrees * Math.PI / 180_000;
      const sine = Math.sin(yawRadians);
      const cosine = Math.cos(yawRadians);
      const targetUnitX = deltaX / distance;
      const targetUnitZ = deltaZ / distance;
      const centerlineUnitX =
        -Math.sign(before.localAuthoritativePosition.x || 1);
      const scoreRecoveryDirection = (worldX, worldZ) => (
        centerlineUnitX * worldX * 2
        + targetUnitX * worldX
        + targetUnitZ * worldZ
      );
      const recoveryKey =
        scoreRecoveryDirection(cosine, -sine)
          >= scoreRecoveryDirection(-cosine, sine)
          ? 'KeyD'
          : 'KeyA';
      await page.keyboard.down(recoveryKey);
      await delay(180);
      await page.keyboard.up(recoveryKey);
      await delay(420);
      stalledPulses = 0;
      continue;
    }
    await rotateToYaw(
      page,
      headingToMapTarget(before.localAuthoritativePosition, target),
    );
    const duration = distance <= nearTargetConvergenceBandMillimeters
      ? 35
      : Math.max(80, Math.min(140, distance / 6_500 * 1_000));
    await page.keyboard.down('KeyW');
    await delay(duration);
    await page.keyboard.up('KeyW');
    await delay(420);
  }
  const value = await snapshot(page);
  throw new Error(
    `Unable to reach ${label}: ${JSON.stringify({
      target,
      position: value?.localAuthoritativePosition ?? null,
      bestDistance,
      route,
    })}`,
  );
}

const PORTAL_LOWER_ROUTE = Object.freeze([
  Object.freeze({ label: 'west choice', x: -22_000, z: 0 }),
  Object.freeze({ label: 'west ink ramp north', x: -25_000, z: -7_000 }),
  Object.freeze({ label: 'west ink ramp south', x: -25_000, z: -12_000 }),
  Object.freeze({ label: 'west ink landing', x: -22_000, z: -17_000 }),
  Object.freeze({ label: 'west ink bridge mid', x: -15_000, z: -21_000 }),
  Object.freeze({ label: 'ink mid west', x: -8_000, z: -20_000 }),
  Object.freeze({ label: 'lower portal corridor entry', x: -5_000, z: -15_000 }),
]);

const repositoryHeadAtStart = execFileSync(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: repo, encoding: 'utf8' },
).trim();
const repositoryStatusAtStart = execFileSync(
  'git',
  ['status', '--short', '--untracked-files=all'],
  { cwd: repo, encoding: 'utf8' },
).trim();

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output, { recursive: false });
await fs.mkdir(screenshots);
const temporaryRoot = path.resolve(os.tmpdir());
const localAuthorityStatePath = await fs.mkdtemp(path.join(
  temporaryRoot,
  'kyx-g5-player-eye-authority-',
));
const localAuthorityStateRelative = path.relative(
  temporaryRoot,
  localAuthorityStatePath,
);
assert.ok(
  localAuthorityStateRelative.length > 0
    && !localAuthorityStateRelative.startsWith('..')
    && !path.isAbsolute(localAuthorityStateRelative),
  'capture-owned Wrangler state must remain inside the OS temporary directory',
);

let wrangler = null;
let vite = null;
let browser = null;
let context = null;
let guestContext = null;
let result = null;
let failure = null;
const consoleErrors = [];
const pageErrors = [];
const phaseDiagnostics = {};

assert.equal(
  repositoryStatusAtStart,
  '',
  'Player-eye capture requires a clean source-frozen worktree',
);

try {
  wrangler = service([
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--local',
    '--port',
    String(AUTHORITY_PORT),
    '--persist-to',
    localAuthorityStatePath,
    '--var',
    `ALLOWED_ORIGINS:${FRONTEND_ORIGIN}`,
  ]);
  vite = service(
    [
      'node_modules/vite/bin/vite.js',
      '--host',
      '127.0.0.1',
      '--port',
      String(FRONTEND_PORT),
      '--strictPort',
    ],
    {
      ...process.env,
      VITE_KYX_AUTHORITY_ORIGIN: AUTHORITY_ORIGIN,
    },
  );
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
      // Try the next installed location.
    }
  }
  assert.notEqual(chromeExecutable, null, 'System Chrome is required');
  const chromeArguments = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
  ];
  if (rendererMode === 'swiftshader') {
    chromeArguments.push('--use-angle=swiftshader');
  } else {
    chromeArguments.push(
      '--enable-gpu',
      '--enable-gpu-rasterization',
      '--disable-software-rasterizer',
      '--use-angle=d3d11',
    );
  }
  browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: chromeArguments,
  });
  context = await browser.newContext({
    viewport: { width: 1_440, height: 900 },
  });
  guestContext = await browser.newContext({
    viewport: { width: 1_440, height: 900 },
  });
  await context.addInitScript((displayName) => {
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({
        kind: 'local_guest',
        version: 1,
        displayName,
      }),
    );
  }, 'Inkfall Visual Continuity Host');
  await guestContext.addInitScript((displayName) => {
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({
        kind: 'local_guest',
        version: 1,
        displayName,
      }),
    );
  }, 'Inkfall Visual Continuity Guest');
  const page = await context.newPage();
  const guestPage = await guestContext.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`host: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(`host: ${error.message}`));
  guestPage.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(`guest: ${message.text()}`);
    }
  });
  guestPage.on(
    'pageerror',
    (error) => pageErrors.push(`guest: ${error.message}`),
  );

  await page.goto(`${FRONTEND_ORIGIN}/online`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'lobby',
  );
  assert.equal(
    await page.getByTestId('online-inkfall-rev4-profile').isChecked(),
    true,
  );
  await page.getByTestId('online-create-room').click();
  await page.waitForFunction(() => (
    document.body.dataset.onlinePreviewStatus === 'joined'
    && document.body.dataset.online3dStatus === 'ready'
  ), undefined, { timeout: 90_000 });
  await guestPage.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await guestPage.waitForFunction(() => (
    document.body.dataset.onlinePreviewStatus === 'joined'
    && document.body.dataset.online3dStatus === 'ready'
  ), undefined, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return document.body.dataset.onlinePreviewStatus === 'joined'
      && document.body.dataset.online3dStatus === 'ready'
      && value?.connection === 'joined'
      && value.render3d?.status === 'ready'
      && value.render3d.remoteAvatarCount === 1
      && value.combat.snapshot?.players.length === 2
      && value.localAuthoritativePosition !== null
      && value.localAuthoritativeGrounded === true;
  }, undefined, { timeout: 90_000 });

  const joined = await snapshot(page);
  const graphics = await page.evaluate(() => {
    const canvas = document.querySelector('.online-session__canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const context =
      canvas.getContext('webgl2')
      ?? canvas.getContext('webgl')
      ?? canvas.getContext('experimental-webgl');
    if (!(context instanceof WebGLRenderingContext)
      && !(context instanceof WebGL2RenderingContext)) return null;
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: context.getParameter(context.RENDERER),
      vendor: context.getParameter(context.VENDOR),
      unmaskedRenderer: debug === null
        ? null
        : context.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      unmaskedVendor: debug === null
        ? null
        : context.getParameter(debug.UNMASKED_VENDOR_WEBGL),
    };
  });
  assert.notEqual(graphics, null, 'A WebGL context is required');
  if (rendererMode === 'hardware') {
    assert.ok(
      typeof graphics.unmaskedRenderer === 'string'
        && !/(?:swiftshader|llvmpipe|software|basic render)/iu.test(
          graphics.unmaskedRenderer,
        ),
      `Hardware player-eye capture fell back to software: ${
        graphics.unmaskedRenderer ?? 'unreported'
      }`,
    );
  }
  assert.equal(joined.roomVerification.roomProfile, PROFILE);
  assert.equal(joined.roomVerification.mapBinding.mapReference, MAP_REFERENCE);
  assert.equal(
    joined.roomVerification.mapBinding.presentationReference,
    PRESENTATION_REFERENCE,
  );
  assert.equal(
    joined.roomVerification.mapBinding.render.sha256,
    PRESENTATION_SHA256,
  );
  assert.equal(
    joined.roomVerification.mapBinding.portal.capabilityId,
    'inkfall_rev5_linked_world_portal_v1',
  );
  assert.equal(joined.roomVerification.mapBinding.fixtureHash, FIXTURE_HASH);
  assert.equal(joined.roomVerification.mapBinding.colliderCardinality, 339);
  assert.equal(joined.roomVerification.mapBinding.spawns.length, 12);
  assert.equal(joined.roomVerification.mapBinding.zones.length, 9);
  assert.equal(joined.render3d.renderMeshesMayBeAuthority, false);
  assert.equal(joined.render3d.presentationMode, 'review_glb');
  assert.equal(joined.render3d.presentationSha256, PRESENTATION_SHA256);
  assert.equal(joined.render3d.renderMeshCount, 36);
  assert.equal(joined.render3d.authorityColliderCount, 339);
  assert.equal(joined.render3d.spawnCount, 12);
  assert.equal(joined.render3d.zoneCount, 9);
  const joinedSpawn = joined.roomVerification.mapBinding.spawns.find((spawn) => (
    spawn.feetPosition.x === joined.localAuthoritativePosition.x
    && spawn.feetPosition.y === joined.localAuthoritativePosition.y
    && spawn.feetPosition.z === joined.localAuthoritativePosition.z
  ));
  assert.notEqual(joinedSpawn, undefined, 'Joined position must match a bound spawn');
  phaseDiagnostics.joined = {
    spawnId: joinedSpawn.spawnId,
    playerId: joined.playerId,
    authoritativePlayerId: joined.localAuthoritativePlayerId,
    spawnYawMilliDegrees: joinedSpawn.yawMilliDegrees,
    authoritativeYawMilliDegrees: joined.localAuthoritativeYawMilliDegrees,
    predictedYawMilliDegrees: joined.localPredictedYawMilliDegrees,
    positionMm: joined.localAuthoritativePosition,
  };
  assert.equal(
    joined.localAuthoritativePlayerId,
    joined.playerId,
    'Joined local reconciliation must belong to the accepted player identity',
  );
  assert.equal(
    joined.localAuthoritativeYawMilliDegrees,
    joinedSpawn.yawMilliDegrees,
    'Joined authoritative yaw must match the bound spawn facing',
  );
  assert.equal(
    joined.localPredictedYawMilliDegrees,
    joined.localAuthoritativeYawMilliDegrees,
    'Joined predicted yaw must begin from authoritative yaw',
  );
  assert.ok(
    joined.render3d.renderOnlyContainmentMeshCount > 200,
    'The continuity batch should contribute a major render-only dressing set.',
  );

  await delay(800);
  await captureArena(page, '01-west-spawn-pocket-forward.png');
  assert.equal(joined.inputBridge.aimHeld, false);
  assert.equal(joined.render3d.selectedFirstPersonAimRequested, false);
  assert.ok(joined.render3d.selectedFirstPersonAimMix <= 0.01);
  assert.equal(
    joined.render3d.selectedFirstPersonFieldOfViewDegrees,
    72,
  );

  const canvas = page.locator('.online-session__canvas');
  await canvas.hover();
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.inputBridge.aimHeld === true
      && value.render3d?.selectedFirstPersonAimRequested === true
      && value.render3d.selectedFirstPersonAimMix >= 0.95;
  });
  const aimed = await snapshot(page);
  assert.ok(
    aimed.render3d.selectedFirstPersonFieldOfViewDegrees <= 60.75,
    `VLR-7 ADS must narrow the player field of view: ${
      aimed.render3d.selectedFirstPersonFieldOfViewDegrees
    }`,
  );
  assert.ok(
    aimed.render3d.selectedFirstPersonScale
      < joined.render3d.selectedFirstPersonScale,
    'VLR-7 ADS must compensate for FOV narrowing with an authored viewmodel scale.',
  );
  await captureArena(page, '01b-vlr7-held-ads.png');
  await page.mouse.up({ button: 'right' });
  await page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.inputBridge.aimHeld === false
      && value.render3d?.selectedFirstPersonAimMix <= 0.05;
  });

  const acceptedAttackCountBefore =
    aimed.render3d.acceptedAttackPresentationCount;
  await page.waitForFunction(() => (
    (() => {
      const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      const local = value?.combat.snapshot?.players.find(
        ({ playerId }) => playerId === value.playerId,
      );
      const weapon = local?.weapons?.find(
        ({ weaponId }) => weaponId === local.selectedWeaponId,
      );
      return value?.combat.snapshot?.match.phase === 'active'
        && weapon?.phase === 'ready';
    })()
  ), undefined, { timeout: 20_000 });
  let firing = null;
  await page.keyboard.down('Enter');
  try {
    await page.waitForFunction(() => (
      globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()
        .inputBridge.primaryFire === true
    ));
    await page.waitForFunction((previous) => {
      const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      return (
        value?.render3d?.acceptedAttackPresentationCount
        ?? 0
      ) > previous
        && (value?.render3d?.selectedFirstPersonFireImpulse ?? 0) > 0.02
        && (value?.render3d?.activeWeaponEffectCount ?? 0) > 0;
    }, acceptedAttackCountBefore, { timeout: 15_000 });
    firing = await snapshot(page);
    await captureArena(page, '01c-vlr7-authority-fire.png');
  } finally {
    await page.keyboard.up('Enter').catch(() => undefined);
  }
  assert.notEqual(firing, null);
  await page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const local = value?.combat.snapshot?.players.find(
      ({ playerId }) => playerId === value.playerId,
    );
    const weapon = local?.weapons?.find(
      ({ weaponId }) => weaponId === local.selectedWeaponId,
    );
    return weapon?.phase === 'ready'
      && (weapon.magazineRounds ?? 50) < 50;
  }, undefined, { timeout: 15_000 });
  const reloadPresentationCountBefore = (
    await snapshot(page)
  ).render3d.reloadPresentationCount;
  await page.keyboard.down('KeyR');
  await delay(180);
  await page.keyboard.up('KeyR');
  await page.waitForFunction((previous) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return (
      value?.render3d?.reloadPresentationCount
      ?? 0
    ) > previous
      && (value?.render3d?.selectedFirstPersonReloadProgress ?? 0) >= 0.45
      && (value?.render3d?.selectedFirstPersonReloadPoseMix ?? 0) >= 0.85;
  }, reloadPresentationCountBefore);
  const reloading = await snapshot(page);
  assert.equal(reloading.render3d.selectedFirstPersonAimRequested, false);
  assert.ok(reloading.render3d.selectedFirstPersonReloadProgress > 0);
  await captureArena(page, '01d-vlr7-authority-reload.png');
  await page.waitForFunction(() => (
    (
      globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()
        .render3d?.selectedFirstPersonReloadPoseMix
      ?? 1
    ) <= 0.02
  ), undefined, { timeout: 8_000 });

  await page.keyboard.down('KeyW');
  await delay(1_600);
  await page.keyboard.up('KeyW');
  await delay(800);
  const pressApproach = await snapshot(page);
  assert.equal(
    pressApproach.lastError,
    null,
    `Authority failed during forward traversal: ${JSON.stringify(
      pressApproach.lastError,
    )}`,
  );
  const pressApproachDelta = Object.freeze({
    x:
      pressApproach.localAuthoritativePosition.x
      - joined.localAuthoritativePosition.x,
    y:
      pressApproach.localAuthoritativePosition.y
      - joined.localAuthoritativePosition.y,
    z:
      pressApproach.localAuthoritativePosition.z
      - joined.localAuthoritativePosition.z,
  });
  assert.ok(
    Math.hypot(
      pressApproachDelta.x,
      pressApproachDelta.z,
    ) > 2_000,
    'The host must advance far enough to provide a distinct Press Hall view.',
  );
  const joinedYawRadians = joinedSpawn.yawMilliDegrees * Math.PI / 180_000;
  const forwardAlignment = (
    Math.sin(joinedYawRadians) * pressApproachDelta.x
    + Math.cos(joinedYawRadians) * pressApproachDelta.z
  ) / Math.hypot(pressApproachDelta.x, pressApproachDelta.z);
  phaseDiagnostics.pressApproach = {
    playerId: pressApproach.playerId,
    authoritativePlayerId: pressApproach.localAuthoritativePlayerId,
    authoritativeYawMilliDegrees: pressApproach.localAuthoritativeYawMilliDegrees,
    predictedYawMilliDegrees: pressApproach.localPredictedYawMilliDegrees,
    positionMm: pressApproach.localAuthoritativePosition,
    deltaMm: pressApproachDelta,
    forwardAlignment,
    lastError: pressApproach.lastError,
  };
  assert.equal(
    pressApproach.playerId,
    joined.playerId,
    'First-egress traversal must retain the accepted player identity',
  );
  assert.equal(
    pressApproach.localAuthoritativePlayerId,
    joined.localAuthoritativePlayerId,
    'First-egress local reconciliation must retain the same player identity',
  );
  assert.equal(
    pressApproach.localAuthoritativeYawMilliDegrees,
    joined.localAuthoritativeYawMilliDegrees,
    'Forward movement without look input must preserve authoritative yaw',
  );
  assert.ok(
    forwardAlignment > 0.97,
    `First-egress movement must follow spawn facing: ${forwardAlignment}`,
  );
  assert.ok(
    Math.abs(pressApproachDelta.y) <= 250,
    `First-egress traversal must remain supported: ${pressApproachDelta.y} mm`,
  );
  await tapLook(page, 'ArrowUp', 4);
  const pressHallView = await snapshot(page);
  assert.ok(
    Math.abs(
      pressHallView.localPredictedPitchMilliDegrees
        - pressApproach.localPredictedPitchMilliDegrees,
    ) >= 3_000,
    'Press Hall capture must apply a visible pitch change',
  );
  await captureArena(page, '02-press-hall-approach.png');

  await tapLook(page, 'ArrowDown', 4);
  await tapLook(page, 'ArrowLeft', 30);
  const inkChannelView = await snapshot(page);
  assert.ok(
    angularDistanceMilliDegrees(
      pressHallView.localPredictedYawMilliDegrees,
      inkChannelView.localPredictedYawMilliDegrees,
    ) >= 25_000,
    'Ink Channel capture must apply a distinct left-facing camera yaw',
  );
  await captureArena(page, '03-ink-channel-and-red-fold.png');

  await tapLook(page, 'ArrowRight', 60);
  await tapLook(page, 'ArrowUp', 5);
  const archiveView = await snapshot(page);
  assert.ok(
    angularDistanceMilliDegrees(
      inkChannelView.localPredictedYawMilliDegrees,
      archiveView.localPredictedYawMilliDegrees,
    ) >= 50_000,
    'Archive capture must apply a distinct right-facing camera yaw',
  );
  await captureArena(page, '04-archive-tier-and-paper-drop.png');

  await tapLook(page, 'ArrowDown', 6);
  const portalNavigation = [];
  for (const target of PORTAL_LOWER_ROUTE) {
    const leg = await navigateToMapTarget(page, target, target.label);
    portalNavigation.push(Object.freeze({
      label: target.label,
      target: Object.freeze({ x: target.x, z: target.z }),
      route: leg.route,
      arrival: leg.snapshot.localAuthoritativePosition,
    }));
  }
  let portalApproach;
  let portalPresentationCountBefore;
  await page.keyboard.down('KeyC');
  try {
    const lowerApproach = await navigateToMapTarget(
      page,
      { x: -4_500, z: -12_500 },
      'lower portal crouch approach',
      500,
    );
    portalNavigation.push(Object.freeze({
      label: 'lower portal crouch approach',
      target: Object.freeze({ x: -4_500, z: -12_500 }),
      route: lowerApproach.route,
      arrival: lowerApproach.snapshot.localAuthoritativePosition,
    }));
    await rotateToYaw(
      page,
      headingToMapTarget(
        lowerApproach.snapshot.localAuthoritativePosition,
        { x: -4_000, z: -10_000 },
      ),
    );
    portalApproach = await snapshot(page);
    portalPresentationCountBefore =
      portalApproach.render3d.portalTraversalPresentationCount;
    await captureArena(page, '05-red-fold-portal-approach.png');
    await page.keyboard.down('KeyW');
    await delay(650);
    await page.keyboard.up('KeyW');
  } finally {
    await page.keyboard.up('KeyC').catch(() => undefined);
  }
  await page.waitForFunction((expectedCount) => (
    (
      globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()
        .render3d?.portalTraversalPresentationCount
      ?? 0
    ) > expectedCount
  ), portalPresentationCountBefore, { timeout: 15_000 });
  await delay(500);
  const portalExit = await snapshot(page);
  assert.ok(
    portalExit.render3d.portalTraversalPresentationCount
      > portalPresentationCountBefore,
    'Portal traversal must produce a local presentation cue',
  );
  assert.ok(
    Math.hypot(
      portalExit.localAuthoritativePosition.x
        - portalApproach.localAuthoritativePosition.x,
      portalExit.localAuthoritativePosition.y
        - portalApproach.localAuthoritativePosition.y,
      portalExit.localAuthoritativePosition.z
        - portalApproach.localAuthoritativePosition.z,
    ) >= 4_000,
    'Portal traversal must produce a distinct authoritative exit position',
  );
  await captureArena(page, '06-red-fold-linked-exit.png');
  phaseDiagnostics.portal = {
    navigation: portalNavigation,
    approachPositionMm: portalApproach.localAuthoritativePosition,
    approachYawMilliDegrees: portalApproach.localPredictedYawMilliDegrees,
    exitPositionMm: portalExit.localAuthoritativePosition,
    exitYawMilliDegrees: portalExit.localPredictedYawMilliDegrees,
    presentationCountBefore: portalPresentationCountBefore,
    presentationCountAfter:
      portalExit.render3d.portalTraversalPresentationCount,
  };

  const final = await snapshot(page);
  assert.equal(
    final.lastError,
    null,
    `Authority failed during player-eye capture: ${JSON.stringify(final.lastError)}`,
  );
  const repositoryHeadAtEnd = execFileSync(
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: repo, encoding: 'utf8' },
  ).trim();
  assert.equal(
    repositoryHeadAtEnd,
    repositoryHeadAtStart,
    'Repository HEAD changed during player-eye capture',
  );
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  const screenshotFiles = Object.freeze([
    'screenshots/01-west-spawn-pocket-forward.png',
    'screenshots/01b-vlr7-held-ads.png',
    'screenshots/01c-vlr7-authority-fire.png',
    'screenshots/01d-vlr7-authority-reload.png',
    'screenshots/02-press-hall-approach.png',
    'screenshots/03-ink-channel-and-red-fold.png',
    'screenshots/04-archive-tier-and-paper-drop.png',
    'screenshots/05-red-fold-portal-approach.png',
    'screenshots/06-red-fold-linked-exit.png',
  ]);
  const screenshotIntegrity = Object.freeze(Object.fromEntries(
    await Promise.all(screenshotFiles.map(async (relative) => {
      const absolute = path.join(output, relative);
      return [relative, Object.freeze({
        bytes: (await fs.stat(absolute)).size,
        sha256: await sha256(absolute),
      })];
    })),
  ));
  assert.equal(
    new Set(Object.values(screenshotIntegrity).map(({ sha256 }) => sha256)).size,
    screenshotFiles.length,
    'Every player-eye screenshot must contain a distinct view',
  );
  result = Object.freeze({
    schemaVersion: 1,
    status: 'rev5_player_eye_capture_complete_human_review_open',
    profile: PROFILE,
    mapReference: MAP_REFERENCE,
    presentationReference: PRESENTATION_REFERENCE,
    sourceFreeze: Object.freeze({
      repositoryHead: repositoryHeadAtStart,
      cleanAtStart: repositoryStatusAtStart === '',
      headUnchangedDuringCapture:
        repositoryHeadAtEnd === repositoryHeadAtStart,
    }),
    authority: Object.freeze({
      fixtureHash: FIXTURE_HASH,
      colliderCount: final.render3d.authorityColliderCount,
      spawnCount: final.render3d.spawnCount,
      zoneCount: final.render3d.zoneCount,
      renderMeshesMayBeAuthority:
        final.render3d.renderMeshesMayBeAuthority,
      persistenceMode: 'capture_owned_ephemeral_temp',
    }),
    presentation: Object.freeze({
      mode: final.render3d.presentationMode,
      sha256: final.render3d.presentationSha256,
      renderMeshCount: final.render3d.renderMeshCount,
      renderOnlyVisualContinuityMeshCount:
        final.render3d.renderOnlyContainmentMeshCount,
      spawnPocketCount: final.render3d.spawnPocketContainmentCount,
      portalTraversalPresentationCount:
        final.render3d.portalTraversalPresentationCount,
      isolatedPlayerContexts: 2,
      rendererMode,
      graphics,
    }),
    weaponPresentation: Object.freeze({
      authorityWeaponId: aimed.render3d.selectedWeaponId,
      contactMode: aimed.render3d.selectedFirstPersonContactMode,
      handCount: aimed.render3d.selectedFirstPersonHandCount,
      hipFieldOfViewDegrees:
        joined.render3d.selectedFirstPersonFieldOfViewDegrees,
      aimedFieldOfViewDegrees:
        aimed.render3d.selectedFirstPersonFieldOfViewDegrees,
      aimedMix: aimed.render3d.selectedFirstPersonAimMix,
      hipScale: joined.render3d.selectedFirstPersonScale,
      aimedScale: aimed.render3d.selectedFirstPersonScale,
      acceptedAttackPresentationCount:
        reloading.render3d.acceptedAttackPresentationCount,
      activeWeaponEffectCountAtFireCapture:
        firing.render3d.activeWeaponEffectCount,
      fireImpulseAtCapture:
        firing.render3d.selectedFirstPersonFireImpulse,
      reloadPresentationCount:
        reloading.render3d.reloadPresentationCount,
      reloadProgressAtCapture:
        reloading.render3d.selectedFirstPersonReloadProgress,
      reloadPoseMixAtCapture:
        reloading.render3d.selectedFirstPersonReloadPoseMix,
      presentationOnlyAimInput: true,
    }),
    player: Object.freeze({
      joinedSpawnId: joinedSpawn.spawnId,
      joinedYawMilliDegrees: joinedSpawn.yawMilliDegrees,
      joinedPositionMm: joined.localAuthoritativePosition,
      pressApproachPositionMm: pressApproach.localAuthoritativePosition,
      pressApproachDeltaMm: pressApproachDelta,
      forwardAlignment,
      portalApproachPositionMm: portalApproach.localAuthoritativePosition,
      portalExitPositionMm: portalExit.localAuthoritativePosition,
      finalPositionMm: final.localAuthoritativePosition,
      cameraViews: Object.freeze({
        spawn: Object.freeze({
          yawMilliDegrees: joined.localPredictedYawMilliDegrees,
          pitchMilliDegrees: joined.localPredictedPitchMilliDegrees,
        }),
        pressHall: Object.freeze({
          yawMilliDegrees: pressHallView.localPredictedYawMilliDegrees,
          pitchMilliDegrees: pressHallView.localPredictedPitchMilliDegrees,
        }),
        inkChannel: Object.freeze({
          yawMilliDegrees: inkChannelView.localPredictedYawMilliDegrees,
          pitchMilliDegrees: inkChannelView.localPredictedPitchMilliDegrees,
        }),
        archive: Object.freeze({
          yawMilliDegrees: archiveView.localPredictedYawMilliDegrees,
          pitchMilliDegrees: archiveView.localPredictedPitchMilliDegrees,
        }),
        portalApproach: Object.freeze({
          yawMilliDegrees: portalApproach.localPredictedYawMilliDegrees,
          pitchMilliDegrees: portalApproach.localPredictedPitchMilliDegrees,
        }),
        portalExit: Object.freeze({
          yawMilliDegrees: portalExit.localPredictedYawMilliDegrees,
          pitchMilliDegrees: portalExit.localPredictedPitchMilliDegrees,
        }),
      }),
    }),
    screenshots: screenshotFiles,
    screenshotIntegrity,
    consoleErrors: Object.freeze(consoleErrors),
    pageErrors: Object.freeze(pageErrors),
    nonClaims: Object.freeze([
      'Focused visual capture only; no broad regression, performance, spawn-safety, fun, staging, deployment, release, or G5 acceptance claim.',
      'All visual-continuity additions are render-only/noHit; Rev3 remains the sole authority fixture.',
    ]),
  });
  await fs.writeFile(
    path.join(output, 'focused-visual-capture.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
} catch (error) {
  failure = error;
  await fs.writeFile(
    path.join(output, 'failure.json'),
    `${JSON.stringify({
      message: error instanceof Error ? error.stack : String(error),
      consoleErrors,
      pageErrors,
      phaseDiagnostics,
      vite: vite?.lines ?? [],
      wrangler: wrangler?.lines ?? [],
    }, null, 2)}\n`,
    'utf8',
  );
} finally {
  if (guestContext !== null) await guestContext.close().catch(() => {});
  if (context !== null) await context.close().catch(() => {});
  if (browser !== null) await browser.close().catch(() => {});
  await Promise.all([stopService(vite), stopService(wrangler)]);
  await fs.writeFile(
    path.join(output, 'services.json'),
    `${JSON.stringify({
      vite: vite?.lines ?? [],
      wrangler: wrangler?.lines ?? [],
    }, null, 2)}\n`,
    'utf8',
  );
  await fs.rm(localAuthorityStatePath, { recursive: true, force: true });
}

if (failure !== null) throw failure;
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
