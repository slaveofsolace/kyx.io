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
const FIXTURE_HASH = '97eb7772ac59dc95';
const SPAWN_STRATEGY = 'rev3_authority_enemy_distance_fixture_occluded_los_v1';
const FRONTEND_PORT = 6_237;
const AUTHORITY_PORT = 8_937;
const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2] ?? 'evidence/2026-07-28/g5-spawn-readability-sentinel-v1',
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
    if (lines.length > 400) lines.splice(0, lines.length - 400);
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

async function waitForHttp(url, timeoutMilliseconds = 60_000) {
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

async function snapshot(page) {
  return await page.evaluate(
    () => globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot() ?? null,
  );
}

async function waitForPopulation(clients, population) {
  await Promise.all(clients.map(({ page }) => page.waitForFunction(
    (expected) => {
      const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      return document.body.dataset.onlinePreviewStatus === 'joined'
        && document.body.dataset.online3dStatus === 'ready'
        && value?.connection === 'joined'
        && value.render3d?.status === 'ready'
        && value.render3d.remoteAvatarCount === expected - 1
        && value.remotePlayers === expected - 1
        && value.combat.snapshot?.players.length === expected
        && value.localAuthoritativePosition !== null
        && value.localAuthoritativeGrounded === true;
    },
    population,
    { timeout: 150_000 },
  )));
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
  assert.ok(value.render3d.renderOnlyContainmentMeshCount >= 20);
  assert.equal(value.render3d.spawnPocketContainmentCount, 2);
  assert.equal(value.render3d.authorityColliderCount, 339);
  assert.equal(value.render3d.spawnCount, 12);
  assert.equal(value.render3d.zoneCount, 9);
}

function nearestLockedSpawn(value) {
  const position = value.localAuthoritativePosition;
  const spawns = value.roomVerification.mapBinding.spawns;
  return spawns
    .map((spawn) => ({
      spawn,
      distance: Math.hypot(
        position.x - spawn.feetPosition.x,
        position.y - spawn.feetPosition.y,
        position.z - spawn.feetPosition.z,
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
}

async function railDiagnostics(page) {
  return await page.evaluate(() => {
    const rail = document.querySelector('[data-testid="online-weapon-rail"]');
    const buttons = [...rail.querySelectorAll('button')];
    const rect = rail.getBoundingClientRect();
    const entries = buttons.map((button) => {
      const buttonRect = button.getBoundingClientRect();
      const label = button.querySelector('span');
      return {
        top: buttonRect.top,
        left: buttonRect.left,
        right: buttonRect.right,
        width: buttonRect.width,
        height: buttonRect.height,
        overflow: button.scrollWidth - button.clientWidth,
        labelDisplay: getComputedStyle(label).display,
        whiteSpace: getComputedStyle(button).whiteSpace,
        ariaLabel: button.getAttribute('aria-label'),
      };
    });
    return {
      width: rect.width,
      height: rect.height,
      entries,
    };
  });
}

function assertDesktopRail(rail) {
  assert.equal(rail.entries.length, 6);
  assert.ok(rail.width <= 537);
  assert.ok(rail.height <= 34);
  assert.ok(Math.max(...rail.entries.map(({ top }) => top))
    - Math.min(...rail.entries.map(({ top }) => top)) <= 1);
  assert.ok(rail.entries.every(({ height }) => height <= 33));
  assert.ok(rail.entries.every(({ overflow }) => overflow <= 1));
  assert.ok(rail.entries.every(({ whiteSpace }) => whiteSpace === 'nowrap'));
  assert.ok(rail.entries.every(({ ariaLabel }) => /^Weapon [1-6]: /u.test(ariaLabel)));
  for (let index = 1; index < rail.entries.length; index += 1) {
    assert.ok(rail.entries[index - 1].right <= rail.entries[index].left);
  }
}

function assertMobileRail(rail) {
  assert.equal(rail.entries.length, 6);
  assert.ok(rail.width <= 331);
  assert.ok(rail.height <= 30);
  assert.ok(rail.entries.every(({ labelDisplay }) => labelDisplay === 'none'));
  assert.ok(Math.max(...rail.entries.map(({ top }) => top))
    - Math.min(...rail.entries.map(({ top }) => top)) <= 1);
  for (let index = 1; index < rail.entries.length; index += 1) {
    assert.ok(rail.entries[index - 1].right <= rail.entries[index].left);
  }
}

async function createClient(browser, index) {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  await context.addInitScript((displayName) => {
    localStorage.setItem(
      'kyx_local_profile',
      JSON.stringify({ kind: 'local_guest', version: 1, displayName }),
    );
  }, `G5 Spawn Sentinel ${index + 1}`);
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requests = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfinished', (request) => requests.push(request.url()));
  return { context, page, consoleErrors, pageErrors, requests };
}

async function metrics(roomCode, access) {
  const response = await fetch(`${AUTHORITY_ORIGIN}/api/rooms/${roomCode}/metrics`, {
    headers: {
      Origin: FRONTEND_ORIGIN,
      [access.headerName]: access.credential,
    },
  });
  assert.equal(response.status, 200);
  return (await response.json()).metrics;
}

function assertSpawnMetrics(value, population) {
  const selection = value.spawnSelection;
  assert.equal(selection.schemaVersion, 1);
  assert.equal(selection.strategy, SPAWN_STRATEGY);
  assert.equal(selection.authorityBoundary, 'server_state_and_authority_collision_only');
  assert.equal(selection.clientPositionOrScoreAccepted, false);
  assert.equal(selection.lockedSpawnIdentityCount, 12);
  assert.equal(selection.decisionCount, population);
  assert.equal(selection.decisions.length, population);
  assert.deepEqual(
    selection.decisions.map(({ populationBeforeSpawn }) => populationBeforeSpawn),
    Array.from({ length: population }, (_, index) => index),
  );
  assert.ok(selection.decisions.every(({ selectedSpawnId }) => (
    /^spawn_(?:w|e|dm)_/u.test(selectedSpawnId)
  )));
  assert.ok(selection.decisions.every(({ decisionHash }) => /^[a-f0-9]{16}$/u.test(decisionHash)));
  assert.ok(selection.decisions.slice(1).every(({ minimumEnemyDistanceMm }) => (
    Number.isSafeInteger(minimumEnemyDistanceMm) && minimumEnemyDistanceMm > 0
  )));
  assert.ok(selection.decisions.every(({ selectedStandingOccluded }) => (
    selectedStandingOccluded === true
  )));
  assert.ok(selection.decisions.every(({ selectedCrouchedOccluded }) => (
    selectedCrouchedOccluded === true
  )));
  assert.ok(selection.decisions.every(({ fallbackMode }) => (
    ['none', 'scored_locked_candidate', 'locked_ordinal'].includes(fallbackMode)
  )));
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
let buildLog = null;
const browsers = [];
const clients = [];
let result = null;
let failure = null;

try {
  const build = await command(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build'],
    { cwd: repo, maxBuffer: 20 * 1024 * 1024 },
  );
  buildLog = Object.freeze({
    stdout: build.stdout,
    stderr: build.stderr,
  });
  const distStats = await fs.stat(path.join(repo, 'dist'));
  assert.equal(distStats.isDirectory(), true, 'Vite build must create dist/');
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
  for (let index = 0; index < 8; index += 1) {
    const browser = await chromium.launch({
      executablePath: chromeExecutable,
      headless: true,
      args: launchArguments,
    });
    browsers.push(browser);
    clients.push(await createClient(browser, index));
  }
  const processIds = await Promise.all(browsers.map(browserProcessId));
  assert.equal(new Set(processIds).size, 8);

  const host = clients[0];
  await host.page.goto(`${FRONTEND_ORIGIN}/online?g6Candidate=rev17`, {
    waitUntil: 'domcontentloaded',
  });
  await host.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'lobby',
  );
  const selector = host.page.getByTestId('online-inkfall-rev4-profile');
  if (!await selector.isChecked()) await selector.check();
  const creationResponse = host.page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.origin === AUTHORITY_ORIGIN
      && url.pathname === '/api/rooms/create'
      && candidate.request().method() === 'POST';
  }, { timeout: 45_000 });
  await host.page.getByTestId('online-create-room').click();
  const creation = await (await creationResponse).json();
  assert.equal(typeof creation.metricsAccess?.headerName, 'string');
  assert.equal(typeof creation.metricsAccess?.credential, 'string');
  await host.page.waitForFunction(
    () => document.body.dataset.onlinePreviewStatus === 'joined',
    undefined,
    { timeout: 120_000 },
  );
  const joinUrl = new URL(host.page.url());
  joinUrl.searchParams.set('g6Candidate', 'rev17');
  assert.equal(joinUrl.searchParams.get('profile'), PROFILE);

  const populationProof = {};
  for (const population of [2, 4, 8]) {
    for (let index = population === 2 ? 1 : population / 2; index < population; index += 1) {
      if (clients[index].page.url() !== 'about:blank') continue;
      await clients[index].page.goto(joinUrl.href, { waitUntil: 'domcontentloaded' });
    }
    const active = clients.slice(0, population);
    await waitForPopulation(active, population);
    const values = await Promise.all(active.map(({ page }) => snapshot(page)));
    values.forEach(assertExactBinding);
    const locked = values.map(nearestLockedSpawn);
    assert.ok(locked.every(({ distance }) => distance <= 100));
    assert.equal(new Set(locked.map(({ spawn }) => spawn.spawnId)).size, population);
    for (let index = 0; index < values.length; index += 1) {
      const yawDelta = Math.abs(
        values[index].localPredictedYawMilliDegrees - locked[index].spawn.yawMilliDegrees,
      );
      assert.ok(Math.min(yawDelta, 360_000 - yawDelta) <= 1);
    }
    const rail = await railDiagnostics(host.page);
    assertDesktopRail(rail);
    const roomMetrics = await metrics(creation.roomCode, creation.metricsAccess);
    assertSpawnMetrics(roomMetrics, population);
    await captureArena(host.page, `g5-spawn-contained-${population}-players.png`);
    if (population === 8) {
      await captureArena(clients[1].page, 'g5-spawn-contained-red-team.png');
    }
    populationProof[population] = Object.freeze({
      distinctPlayers: new Set(values.map(({ playerId }) => playerId)).size,
      distinctLockedSpawns: new Set(locked.map(({ spawn }) => spawn.spawnId)).size,
      spawnIds: locked.map(({ spawn }) => spawn.spawnId),
      containmentMeshes: values[0].render3d.renderOnlyContainmentMeshCount,
      remoteAvatarsPerClient: values.map(({ render3d }) => render3d.remoteAvatarCount),
      spawnDecisionCount: roomMetrics.spawnSelection.decisionCount,
      spawnFallbackCount: roomMetrics.spawnSelection.fallbackCount,
      rail,
    });
  }

  await host.page.setViewportSize({ width: 480, height: 800 });
  await delay(250);
  const mobileRail = await railDiagnostics(host.page);
  assertMobileRail(mobileRail);
  await host.page.screenshot({
    path: path.join(screenshots, 'g5-spawn-rail-mobile.png'),
    fullPage: true,
  });

  const provenance = await Promise.all(clients.map(async ({ page, requests }) => {
    const evidence = await page.evaluate(
      () => globalThis.__KYX_G6_REV17_EVIDENCE__?.snapshot() ?? null,
    );
    const paths = requests.map((url) => new URL(url).pathname);
    assert.ok(paths.some((value) => value.endsWith('/character-lod0.glb')));
    assert.ok(paths.some((value) => value.endsWith('/character-lod1.glb')));
    assert.equal(paths.some((value) => (
      /^\/(?:soldier|player|spartan|weapons|zombie)\.glb$/u.test(value)
    )), false);
    assert.equal(evidence.revision, 'rev17');
    assert.ok((evidence.connectedByRole.online_remote ?? 0) >= 1);
    return {
      revision: evidence.revision,
      onlineRemoteInstances: evidence.connectedByRole.online_remote,
      rev17AssetRequests: paths.filter((value) => value.includes('/candidates/g6-rev17/')),
      legacyRuntimeRequests: paths.filter((value) => (
        /^\/(?:soldier|player|spartan|weapons|zombie)\.glb$/u.test(value)
      )),
    };
  }));
  for (const client of clients) {
    assert.deepEqual(client.consoleErrors, []);
    assert.deepEqual(client.pageErrors, []);
  }
  const { stdout: head } = await command('git', ['rev-parse', 'HEAD'], { cwd: repo });
  result = Object.freeze({
    status: 'G5_SPAWN_READABILITY_2_4_8_SENTINEL_PASS',
    capturedAt: new Date().toISOString(),
    head: head.trim(),
    profile: PROFILE,
    roomCode: creation.roomCode,
    chromeProcessIds: processIds,
    map: Object.freeze({
      mapReference: MAP_REFERENCE,
      presentationReference: PRESENTATION_REFERENCE,
      presentationSha256: PRESENTATION_SHA256,
      fixtureHash: FIXTURE_HASH,
      renderMeshesMayBeAuthority: false,
      authorityColliderCount: 339,
      lockedSpawnIdentityCount: 12,
    }),
    populationProof: Object.freeze(populationProof),
    mobileRail,
    provenance,
    screenshots: Object.freeze([
      'screenshots/g5-spawn-contained-2-players.png',
      'screenshots/g5-spawn-contained-4-players.png',
      'screenshots/g5-spawn-contained-8-players.png',
      'screenshots/g5-spawn-contained-red-team.png',
      'screenshots/g5-spawn-rail-mobile.png',
    ]),
    nonclaims: Object.freeze([
      'One focused 2/4/8 online sentinel only; no broad regression or performance qualification.',
      'Containment and dressing are render-only; the exact 339-collider Rev3 fixture remains authority.',
      'No human visual, fun, staging, deployment, release, or final G5 acceptance claim.',
    ]),
  });
  await fs.writeFile(
    path.join(output, 'result.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  );
  console.log(result.status);
  console.log(JSON.stringify({
    populations: Object.fromEntries(
      Object.entries(populationProof).map(([key, value]) => [
        key,
        {
          spawns: value.spawnIds,
          decisions: value.spawnDecisionCount,
          fallbacks: value.spawnFallbackCount,
        },
      ]),
    ),
    containmentMeshes: populationProof[8].containmentMeshes,
    provenanceClients: provenance.length,
  }));
} catch (cause) {
  failure = {
    status: 'G5_SPAWN_READABILITY_2_4_8_SENTINEL_FAIL',
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
      build: buildLog,
      vite: vite?.lines ?? [],
      wrangler: wrangler?.lines ?? [],
      failed: failure !== null,
      passed: result !== null,
    }, null, 2)}\n`,
    'utf8',
  );
}
