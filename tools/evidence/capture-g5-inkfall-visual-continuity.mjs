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
const FIXTURE_HASH = '6cf785c5171f2ff5';
const PRESENTATION_REFERENCE =
  'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular';
const PRESENTATION_SHA256 =
  '7bd3d5be1ca8019492b58c2dff92a307d30ec77996e978e662bac85dbec0d676';
const FRONTEND_PORT = 6_247;
const AUTHORITY_PORT = 8_947;
const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2]
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
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press(code);
    await delay(38);
  }
  await delay(350);
}

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
  browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-angle=swiftshader',
    ],
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
  assert.equal(joined.render3d.renderMeshCount, 23);
  assert.equal(joined.render3d.authorityColliderCount, 339);
  assert.equal(joined.render3d.spawnCount, 12);
  assert.equal(joined.render3d.zoneCount, 9);
  assert.ok(
    joined.render3d.renderOnlyContainmentMeshCount > 200,
    'The continuity batch should contribute a major render-only dressing set.',
  );

  await delay(800);
  await captureArena(page, '01-west-spawn-pocket-forward.png');

  await page.keyboard.down('KeyW');
  await delay(3_000);
  await page.keyboard.up('KeyW');
  await delay(800);
  const pressApproach = await snapshot(page);
  assert.ok(
    Math.hypot(
      pressApproach.localAuthoritativePosition.x
        - joined.localAuthoritativePosition.x,
      pressApproach.localAuthoritativePosition.z
        - joined.localAuthoritativePosition.z,
    ) > 2_000,
    'The host must advance far enough to provide a distinct Press Hall view.',
  );
  await tapLook(page, 'ArrowUp', 4);
  await captureArena(page, '02-press-hall-approach.png');

  await tapLook(page, 'ArrowDown', 4);
  await tapLook(page, 'ArrowLeft', 30);
  await captureArena(page, '03-ink-channel-and-red-fold.png');

  await tapLook(page, 'ArrowRight', 60);
  await tapLook(page, 'ArrowUp', 5);
  await captureArena(page, '04-archive-tier-and-paper-drop.png');

  const final = await snapshot(page);
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
    'screenshots/02-press-hall-approach.png',
    'screenshots/03-ink-channel-and-red-fold.png',
    'screenshots/04-archive-tier-and-paper-drop.png',
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
      isolatedPlayerContexts: 2,
    }),
    player: Object.freeze({
      joinedPositionMm: joined.localAuthoritativePosition,
      pressApproachPositionMm: pressApproach.localAuthoritativePosition,
      finalPositionMm: final.localAuthoritativePosition,
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
