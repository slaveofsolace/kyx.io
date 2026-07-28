import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const command = promisify(execFile);
const PROFILE = 'g5-inkfall-foundry-rev4-revision-3-authority-v1';
const MAP_REFERENCE = 'inkfall_foundry@3';
const PRESENTATION_REFERENCE =
  'inkfall_foundry@3/press_archive/v4.1/spatial-material-joined';
const PRESENTATION_SHA256 =
  '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00';
const FIXTURE_HASH = '6cf785c5171f2ff5';
const FRONTEND_PORT = 6_217;
const AUTHORITY_PORT = 8_917;
const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2] ?? 'evidence/2026-07-28/g5-online3d-sentinel-v1',
);
const screenshots = path.join(output, 'screenshots');
const delay = (milliseconds) => new Promise((resolve) => {
  setTimeout(resolve, milliseconds);
});

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
    if (lines.length > 300) lines.splice(0, lines.length - 300);
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

function localPlayer(value) {
  return value.combat.snapshot.players.find(
    ({ playerId }) => playerId === value.playerId,
  );
}

function horizontalDistance(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

async function waitForJoined3d(page, remotePlayers) {
  await page.waitForFunction((expectedRemotes) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return document.body.dataset.onlinePreviewStatus === 'joined'
      && document.body.dataset.online3dStatus === 'ready'
      && value?.connection === 'joined'
      && value.render3d?.status === 'ready'
      && value.render3d.remoteAvatarCount === expectedRemotes
      && value.remotePlayers === expectedRemotes
      && value.combat.snapshot?.players.length === expectedRemotes + 1
      && value.localAuthoritativePosition !== null
      && value.localAuthoritativeGrounded === true;
  }, remotePlayers, { timeout: 90_000 });
}

function assertExactBinding(value) {
  assert.equal(value.roomVerification.roomProfile, PROFILE);
  assert.equal(value.roomVerification.mapBinding.mapReference, MAP_REFERENCE);
  assert.equal(
    value.roomVerification.mapBinding.presentationReference,
    PRESENTATION_REFERENCE,
  );
  assert.equal(value.roomVerification.mapBinding.fixtureHash, FIXTURE_HASH);
  assert.equal(value.roomVerification.mapBinding.colliderCardinality, 339);
  assert.equal(value.roomVerification.mapBinding.spawns.length, 12);
  assert.equal(value.roomVerification.mapBinding.zones.length, 9);
  assert.equal(value.roomVerification.mapBinding.pickups.length, 0);
  assert.equal(
    value.roomVerification.mapBinding.render.renderMeshesMayBeAuthority,
    false,
  );
  assert.equal(value.render3d.renderer, 'three_webgl');
  assert.equal(value.render3d.mapReference, MAP_REFERENCE);
  assert.equal(value.render3d.presentationReference, PRESENTATION_REFERENCE);
  assert.equal(value.render3d.presentationSha256, PRESENTATION_SHA256);
  assert.equal(value.render3d.authorityFixtureHash, FIXTURE_HASH);
  assert.equal(value.render3d.renderMeshesMayBeAuthority, false);
  assert.equal(value.render3d.renderMeshCount, 45);
  assert.equal(value.render3d.authorityColliderCount, 339);
  assert.equal(value.render3d.spawnCount, 12);
  assert.equal(value.render3d.zoneCount, 9);
}

async function createClient(browser, displayName) {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  await context.addInitScript((name) => {
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({ kind: 'local_guest', version: 1, displayName: name }),
    );
  }, displayName);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return { context, page, consoleErrors, pageErrors };
}

async function captureArena(page, filename) {
  await page.locator('.online-session__canvas-wrap').screenshot({
    path: path.join(screenshots, filename),
  });
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(output, { recursive: false });
await fs.mkdir(screenshots);

let wrangler = null;
let vite = null;
const browsers = [];
const clients = [];
let result = null;
let failure = null;

try {
  wrangler = service([
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--local',
    '--port',
    String(AUTHORITY_PORT),
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
  const launchArguments = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
  ];
  for (let index = 0; index < 2; index += 1) {
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: launchArguments,
    });
    browsers.push(browser);
    clients.push(await createClient(browser, `G5 3D Sentinel ${index + 1}`));
  }
  assert.notEqual(browsers[0], browsers[1]);
  assert.notEqual(clients[0].context, clients[1].context);

  const host = clients[0];
  const guest = clients[1];
  await host.page.goto(`${FRONTEND_ORIGIN}/online`, {
    waitUntil: 'domcontentloaded',
  });
  await host.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'lobby',
  );
  const rev4Selector = host.page.getByTestId('online-inkfall-rev4-profile');
  assert.equal(await rev4Selector.isChecked(), true);
  await host.page.getByTestId('online-create-room').click();
  await host.page.waitForFunction(() => (
    document.body.dataset.onlinePreviewStatus === 'joined'
    && document.body.dataset.online3dStatus === 'ready'
  ), undefined, { timeout: 90_000 });
  const joinUrl = host.page.url();
  assert.equal(new URL(joinUrl).searchParams.get('profile'), PROFILE);

  await guest.page.goto(joinUrl, { waitUntil: 'domcontentloaded' });
  await Promise.all([
    waitForJoined3d(host.page, 1),
    waitForJoined3d(guest.page, 1),
  ]);
  const joined = [await snapshot(host.page), await snapshot(guest.page)];
  joined.forEach(assertExactBinding);
  assert.equal(joined[0].roomCode, joined[1].roomCode);
  assert.equal(joined[0].matchId, joined[1].matchId);
  assert.notEqual(joined[0].playerId, joined[1].playerId);
  assert.equal(joined[0].render3d.remoteAvatarCount, 1);
  assert.equal(joined[1].render3d.remoteAvatarCount, 1);

  const uniqueSpawnPositions = new Set(joined.map((value) => {
    const position = value.localAuthoritativePosition;
    return `${Math.round(position.x)}:${Math.round(position.y)}:${Math.round(position.z)}`;
  }));
  assert.equal(uniqueSpawnPositions.size, 2);
  for (const value of joined) {
    const position = value.localAuthoritativePosition;
    assert.ok(Math.abs(position.x) <= 36_000);
    assert.ok(Math.abs(position.z) <= 28_000);
    assert.equal(value.localAuthoritativeGrounded, true);
  }

  const beforeMovement = await snapshot(host.page);
  await host.page.keyboard.down('KeyW');
  await delay(750);
  await host.page.keyboard.up('KeyW');
  await host.page.waitForFunction((start) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const position = value?.localAuthoritativePosition;
    return position !== null
      && position !== undefined
      && Math.hypot(position.x - start.x, position.z - start.z) >= 250;
  }, beforeMovement.localAuthoritativePosition, { timeout: 10_000 });
  const afterMovement = await snapshot(host.page);
  const movementMillimeters = horizontalDistance(
    beforeMovement.localAuthoritativePosition,
    afterMovement.localAuthoritativePosition,
  );
  assert.ok(movementMillimeters >= 250);

  const jumpGroundY = afterMovement.localAuthoritativePosition.y;
  await host.page.keyboard.down('Space');
  await delay(180);
  await host.page.keyboard.up('Space');
  await host.page.waitForFunction((groundY) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.localAuthoritativePosition?.y > groundY + 120
      && value.localAuthoritativeGrounded === false;
  }, jumpGroundY, { timeout: 10_000 });
  const airborne = await snapshot(host.page);
  await host.page.waitForFunction((groundY) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.localAuthoritativeGrounded === true
      && Math.abs((value.localAuthoritativePosition?.y ?? Infinity) - groundY) <= 80;
  }, jumpGroundY, { timeout: 12_000 });
  const landed = await snapshot(host.page);

  await host.page.getByTestId('online-weapon-slot-1').click();
  await host.page.waitForFunction(() => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const player = value?.combat.snapshot?.players.find(
      ({ playerId }) => playerId === value.playerId,
    );
    const weapon = player?.weapons?.find(({ slot }) => slot === 1);
    return player?.selectedWeaponSlot === 1
      && player.selectedWeaponId === 'kyx_sidearm_v1'
      && weapon?.phase === 'ready'
      && value.render3d?.selectedProceduralDefinitionId === 'magnum';
  }, undefined, { timeout: 10_000 });
  const beforeSidearm = await snapshot(host.page);
  const beforeSidearmPlayer = localPlayer(beforeSidearm);
  const beforeSidearmWeapon = beforeSidearmPlayer.weapons.find(({ slot }) => slot === 1);
  const renderedEventsBefore = beforeSidearm.render3d.renderedReliableEventCount;
  await host.page.keyboard.down('KeyF');
  await host.page.waitForFunction((acceptedAttackCount) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    const player = value?.combat.snapshot?.players.find(
      ({ playerId }) => playerId === value.playerId,
    );
    const weapon = player?.weapons?.find(({ slot }) => slot === 1);
    return (weapon?.acceptedAttackCount ?? 0) > acceptedAttackCount;
  }, beforeSidearmWeapon.acceptedAttackCount, { timeout: 10_000 });
  await captureArena(host.page, 'g5-online3d-host-sidearm.png');
  await host.page.keyboard.up('KeyF');
  await host.page.waitForFunction((minimum) => (
    (globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot()
      .render3d?.renderedReliableEventCount ?? 0) > minimum
  ), renderedEventsBefore, { timeout: 10_000 });
  const afterSidearm = await snapshot(host.page);
  const afterSidearmPlayer = localPlayer(afterSidearm);
  const afterSidearmWeapon = afterSidearmPlayer.weapons.find(({ slot }) => slot === 1);
  assert.equal(afterSidearmPlayer.selectedWeaponId, 'kyx_sidearm_v1');
  assert.equal(afterSidearm.render3d.selectedProceduralDefinitionId, 'magnum');
  assert.ok(
    afterSidearmWeapon.acceptedAttackCount > beforeSidearmWeapon.acceptedAttackCount,
  );
  assert.ok(afterSidearmWeapon.magazineRounds < beforeSidearmWeapon.magazineRounds);
  assert.ok(afterSidearm.render3d.renderedReliableEventCount > renderedEventsBefore);
  await captureArena(guest.page, 'g5-online3d-guest-remote-avatar.png');

  const beforeResume = await snapshot(host.page);
  await host.page.getByTestId('online-resume').click();
  await host.page.waitForFunction((hydrations) => {
    const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
    return value?.connection === 'joined'
      && value.resumeSuccesses >= 1
      && value.presentation.status === 'ready'
      && value.presentation.hydrationCount > hydrations
      && value.render3d?.status === 'ready';
  }, beforeResume.presentation.hydrationCount, { timeout: 30_000 });
  const afterResume = await snapshot(host.page);
  const afterResumePlayer = localPlayer(afterResume);
  const afterResumeWeapon = afterResumePlayer.weapons.find(({ slot }) => slot === 1);
  assert.equal(afterResume.playerId, beforeResume.playerId);
  assert.equal(afterResume.matchId, beforeResume.matchId);
  assert.equal(afterResumePlayer.selectedWeaponSlot, 1);
  assert.equal(afterResumePlayer.selectedWeaponId, 'kyx_sidearm_v1');
  assert.equal(
    afterResumeWeapon.acceptedAttackCount,
    afterSidearmWeapon.acceptedAttackCount,
  );
  assert.equal(afterResumeWeapon.magazineRounds, afterSidearmWeapon.magazineRounds);
  assert.equal(afterResume.render3d.selectedProceduralDefinitionId, 'magnum');
  assert.equal(afterResume.render3d.remoteAvatarCount, 1);
  assertExactBinding(afterResume);
  await captureArena(host.page, 'g5-online3d-host-resumed.png');

  for (const client of clients) {
    assert.deepEqual(client.consoleErrors, []);
    assert.deepEqual(client.pageErrors, []);
  }
  const { stdout: head } = await command('git', ['rev-parse', 'HEAD'], { cwd: repo });
  result = Object.freeze({
    status: 'G5_ONLINE3D_FOCUSED_SENTINEL_PASS',
    capturedAt: new Date().toISOString(),
    head: head.trim(),
    profile: PROFILE,
    roomCode: afterResume.roomCode,
    matchId: afterResume.matchId,
    distinctPlayers: new Set(joined.map(({ playerId }) => playerId)).size,
    map: Object.freeze({
      mapReference: afterResume.render3d.mapReference,
      presentationReference: afterResume.render3d.presentationReference,
      presentationSha256: afterResume.render3d.presentationSha256,
      fixtureHash: afterResume.render3d.authorityFixtureHash,
      renderMeshesMayBeAuthority: afterResume.render3d.renderMeshesMayBeAuthority,
      renderMeshCount: afterResume.render3d.renderMeshCount,
      authorityColliderCount: afterResume.render3d.authorityColliderCount,
      spawnCount: afterResume.render3d.spawnCount,
      zoneCount: afterResume.render3d.zoneCount,
    }),
    runtime: Object.freeze({
      isolatedChromeLaunches: browsers.length,
      remoteAvatarCountPerClient: joined.map(({ render3d }) => (
        render3d.remoteAvatarCount
      )),
      uniqueSpawnPositions: uniqueSpawnPositions.size,
      movementMillimeters,
      airborneHeightMillimeters:
        airborne.localAuthoritativePosition.y - jumpGroundY,
      landedHeightDeltaMillimeters:
        landed.localAuthoritativePosition.y - jumpGroundY,
      selectedWeaponId: afterResumePlayer.selectedWeaponId,
      selectedProceduralDefinitionId:
        afterResume.render3d.selectedProceduralDefinitionId,
      sidearmAcceptedAttackCount: afterResumeWeapon.acceptedAttackCount,
      renderedReliableEventCount:
        afterResume.render3d.renderedReliableEventCount,
      resumeSuccesses: afterResume.resumeSuccesses,
      presentationHydrations: afterResume.presentation.hydrationCount,
      samePlayerAfterResume: afterResume.playerId === beforeResume.playerId,
      sameMatchAfterResume: afterResume.matchId === beforeResume.matchId,
    }),
    screenshots: Object.freeze([
      'screenshots/g5-online3d-host-sidearm.png',
      'screenshots/g5-online3d-guest-remote-avatar.png',
      'screenshots/g5-online3d-host-resumed.png',
    ]),
    nonclaims: Object.freeze([
      'Focused two-client sentinel only; no broad regression or performance qualification.',
      'Rev4 render meshes remain presentation-only and cannot become collision authority.',
      'No human visual, fun, spawn-safety, staging, deployment, release, or G5 acceptance claim.',
    ]),
  });
  await fs.writeFile(
    path.join(output, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  console.log(result.status);
  console.log(JSON.stringify(result.runtime));
} catch (cause) {
  failure = {
    status: 'G5_ONLINE3D_FOCUSED_SENTINEL_FAIL',
    capturedAt: new Date().toISOString(),
    error: cause instanceof Error ? cause.stack ?? cause.message : String(cause),
  };
  await fs.writeFile(
    path.join(output, 'failure.json'),
    `${JSON.stringify(failure, null, 2)}\n`,
    'utf8',
  );
  throw cause;
} finally {
  for (const client of clients) await client.context.close().catch(() => {});
  for (const browser of browsers) await browser.close().catch(() => {});
  await Promise.all([stopService(vite), stopService(wrangler)]);
  await fs.writeFile(
    path.join(output, 'services.json'),
    `${JSON.stringify({
      vite: vite?.lines ?? [],
      wrangler: wrangler?.lines ?? [],
      failed: failure !== null,
      passed: result !== null,
    }, null, 2)}\n`,
    'utf8',
  );
}
