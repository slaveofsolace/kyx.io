import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

// Full-game runtime audit harness (Fable 5 lane).
//
// Unlike the CI/capture gates, this harness is an AUDITOR: every stage runs in
// a try/catch, failures become recorded findings instead of aborts, and the
// final JSON report is always written. It never asserts visual quality — it
// preserves evidence for human review.

const FRONTEND_PORT = 6_351;
const AUTHORITY_PORT = 8_951;
const FRONTEND_ORIGIN = `http://127.0.0.1:${FRONTEND_PORT}`;
const AUTHORITY_ORIGIN = `http://127.0.0.1:${AUTHORITY_PORT}`;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const startedAtIso = new Date().toISOString();
const repositoryHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repo,
  encoding: 'utf8',
}).trim();
const repositoryBranch = execFileSync(
  'git',
  ['rev-parse', '--abbrev-ref', 'HEAD'],
  { cwd: repo, encoding: 'utf8' },
).trim();
const repositoryStatus = execFileSync(
  'git',
  ['status', '--short', '--untracked-files=all'],
  { cwd: repo, encoding: 'utf8' },
).trim();
const outputArgument = process.argv[2];
const output = path.resolve(
  repo,
  outputArgument
    ?? `evidence/2026-07-31/fable5-full-game-audit-${repositoryHead.slice(0, 7)}`,
);
const screenshots = path.join(output, 'screenshots');
const harnessSha256 = createHash('sha256')
  .update(await fs.readFile(fileURLToPath(import.meta.url)))
  .digest('hex');

await fs.mkdir(screenshots, { recursive: true });

const findings = [];
const stages = {};
const consoleErrors = [];
const pageErrors = [];

function recordFinding(stage, severity, summary, detail = null) {
  findings.push({ stage, severity, summary, detail });
}

const AUDIT_STATUSES = new Set([
  'passed',
  'partial',
  'skipped',
  'unknown',
  'tool_limited',
]);

function auditResult(status, detail, finding = null) {
  if (!AUDIT_STATUSES.has(status)) {
    throw new Error(`Unsupported audit status: ${status}`);
  }
  return { __auditStatus: status, detail, finding };
}

function coverageEntry(
  id,
  label,
  stageName,
  humanStatus,
  nonclaim,
) {
  return {
    id,
    label,
    stage: stageName,
    automationStatus: stageName === null
      ? 'unknown'
      : stages[stageName]?.status ?? 'unknown',
    humanStatus,
    nonclaim,
  };
}

function auditCoverageLedger() {
  return [
    coverageEntry('boot', 'Local services and browser boot', 'boot_services', 'not_required', 'Local boot is not deployed-build identity proof.'),
    coverageEntry('lobby', 'Lobby, room create, and two-client join', 'create_and_join_two_clients', 'required', 'First-use clarity and polish are not automated.'),
    coverageEntry('input', 'Keyboard, mouse, pointer-lock, and blur release', 'movement_probe', 'required', 'Only the exercised keys are sampled; controller is not covered.'),
    coverageEntry('movement', 'Walk, strafe reversal, jump, and landing', 'movement_probe', 'required', 'Mechanics do not approve acceleration, weight, camera coupling, or fun.'),
    coverageEntry('camera', 'Mouse look, pitch/yaw, FOV, and lock recovery', null, 'required', 'Pointer-lock entry is observed; full camera-feel coverage is absent.'),
    coverageEntry('practice_parity', 'Practice and online parity', 'practice_parity_probe', 'required', 'A shared HUD shell does not prove a shared arena or authority model.'),
    coverageEntry('role_presets', 'Assault, Breacher, Recon, and Duelist presets', null, 'required', 'The current run uses one selected preset; four fresh-room runs are owed.'),
    coverageEntry('weapons', 'Rifle, pistol, shotgun, sniper, rocket, and melee', 'weapon_roster_composition', 'required', 'Only weapons exposed by the active preset are exercised.'),
    coverageEntry('first_person_model', 'First-person weapon and hands', 'weapon_roster_composition', 'required', 'Diagnostics and screenshots do not approve scale, grip, clipping, or recoil feel.'),
    coverageEntry('third_person_model', 'Opponent body and armor', null, 'required', 'No authored-character runtime predicate is exercised.'),
    coverageEntry('skins', 'Selectable skins and replication', null, 'required', 'No complete independent skin-selection runtime was found or exercised.'),
    coverageEntry('helmets', 'Role-driven helmet modules', null, 'required', 'Helmet IDs may persist without a matching live rendered module.'),
    coverageEntry('animations', 'Locomotion and combat animation state machine', null, 'required', 'No active-clip, foot-contact, transition, or remote-pose proof is captured.'),
    coverageEntry('blink', 'Blink preview, eligibility, and commit', 'abilities', 'required', 'Collision, counterplay, sound, and exact cross-layer range parity remain separate.'),
    coverageEntry('throwables', 'Launch, smoke, frag, flash, and sticky', 'abilities', 'required', 'Counters do not prove identity, bounce, radius, damage, impairment, or victim readability.'),
    coverageEntry('combat', 'Damage, headshot, kill, death, and respawn', 'combat_damage_kill_respawn', 'required', 'Accepted attacks alone are never treated as hits.'),
    coverageEntry('scoreboard', 'Hold-Tab scoreboard and match flow', 'scoreboard_probe', 'required', 'Presence does not approve opacity, density, hierarchy, or obstruction.'),
    coverageEntry('secure_resume', 'Token-rotating secure reconnect', null, 'required', 'Browser refresh/rejoin is not secure resume.'),
    coverageEntry('refresh_rejoin', 'Browser refresh/rejoin behavior', 'refresh_rejoin', 'required', 'This stage makes no secure-resume claim.'),
    coverageEntry('map_identity', 'Inkfall profile, package, collider, spawn, and zone identity', 'create_and_join_two_clients', 'required', 'Identity and cardinality do not approve map art or play quality.'),
    coverageEntry('map_geometry', 'Routes, collision, bridge, bounds, and supports', null, 'required', 'No full player-driven traversal or geometry defect sweep is captured.'),
    coverageEntry('spawns', '2/4/8 spawn safety and fairness', null, 'required', 'Capsule clearance does not prove live LOS safety or fairness.'),
    coverageEntry('portal', 'Two-way portal traversal and reconnect continuity', null, 'required', 'Portal presence is not traversal proof.'),
    coverageEntry('hud', 'Authority-driven HUD and representative viewports', 'hud_viewport_matrix', 'required', 'Layout measurement does not approve the visual language.'),
    coverageEntry('menus', 'Settings, loadout, maps, pause, death, and result UI', 'practice_parity_probe', 'required', 'The run samples only a subset of menu flows.'),
    coverageEntry('accessibility', 'Keyboard focus, controller, captions, contrast, and reduced motion', null, 'required', 'No WCAG or disabled-player acceptance claim is made.'),
    coverageEntry('audio', 'Weapon, movement, ability, portal, and ambient audio', null, 'required', 'Automated event counts cannot judge timbre, fatigue, mix, or the retro/siren complaint.'),
    coverageEntry('vfx', 'Muzzle, hit, headshot, smoke, flash, kill, and portal VFX', 'abilities', 'required', 'Event correlation does not approve visual quality or clarity.'),
    coverageEntry('performance_2_client', 'Two-client headless performance sample', 'performance_sample', 'required', 'Headless results do not represent owner hardware or dense combat.'),
    coverageEntry('occupancy_2_4_8', 'Source-frozen 2/4/8 runtime matrix', null, 'required', 'This harness creates two clients only.'),
    coverageEntry('soak', 'Final 30-minute eight-client soak', null, 'required', 'No final-source soak is run by this harness.'),
    coverageEntry('package', 'Release package closure and provenance', null, 'owner_decision_required', 'Runtime play does not validate package ledgers, license, or distribution mode.'),
    coverageEntry('staging', 'Staging build identity, isolation, and rollback', null, 'required', 'This local harness does not deploy or validate staging.'),
  ];
}

async function stage(name, run) {
  const startedAt = Date.now();
  try {
    const returned = await run();
    const wrapped = returned?.__auditStatus !== undefined;
    const skipped = !wrapped && returned?.skipped !== undefined;
    const status = wrapped
      ? returned.__auditStatus
      : skipped
        ? 'skipped'
        : 'unknown';
    const detail = wrapped ? returned.detail : returned;
    stages[name] = {
      status,
      milliseconds: Date.now() - startedAt,
      detail: detail ?? null,
    };
    if (wrapped && returned.finding !== null) {
      recordFinding(
        name,
        returned.finding.severity,
        returned.finding.summary,
        returned.finding.detail ?? null,
      );
    }
  } catch (error) {
    stages[name] = {
      status: 'failed',
      milliseconds: Date.now() - startedAt,
      error: String(error?.message ?? error),
    };
    recordFinding(name, 'stage-failure', String(error?.message ?? error));
  }
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

async function waitForHttp(url, timeoutMilliseconds = 60_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still binding.
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

async function shoot(page, filename, fullPage = false) {
  const file = path.join(screenshots, filename);
  if (fullPage) {
    await page.screenshot({ path: file, fullPage: false });
  } else {
    const wrap = page.locator('.online-session__canvas-wrap');
    if (await wrap.count() > 0) {
      await wrap.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: false });
    }
  }
  return path.relative(repo, file).replaceAll('\\', '/');
}

async function tapLook(page, code, count) {
  await page.keyboard.down(code);
  await delay(Math.max(80, count * 55));
  await page.keyboard.up(code);
  await delay(300);
}

function signedAngularDeltaMilliDegrees(target, current) {
  return ((target - current + 540_000) % 360_000) - 180_000;
}

async function rotateToYaw(page, targetYawMilliDegrees) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const value = await snapshot(page);
    if (value?.localPredictedYawMilliDegrees === null) break;
    const delta = signedAngularDeltaMilliDegrees(
      targetYawMilliDegrees,
      value.localPredictedYawMilliDegrees,
    );
    if (Math.abs(delta) <= 4_000) return;
    const count = Math.max(1, Math.min(24, Math.ceil(Math.abs(delta) / 1_700)));
    await tapLook(page, delta > 0 ? 'ArrowRight' : 'ArrowLeft', count);
  }
}

function headingToMapTarget(position, target) {
  const deltaX = target.x - position.x;
  const deltaZ = target.z - position.z;
  return (
    Math.atan2(deltaX, deltaZ) * 180_000 / Math.PI
    + 360_000
  ) % 360_000;
}

function localPlayer(value) {
  return value?.combat?.snapshot?.players?.find(
    ({ playerId }) => playerId === value.playerId,
  ) ?? null;
}

function remotePlayer(value) {
  return value?.combat?.snapshot?.players?.find(
    ({ playerId }) => playerId !== value.playerId,
  ) ?? null;
}

function remoteEntity(value) {
  return value?.remoteEntities?.find(
    ({ entityId }) => entityId !== value.playerId,
  ) ?? value?.remoteEntities?.[0] ?? null;
}

function horizontalDistance(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) {
    return null;
  }
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function horizontalSpeed(velocity) {
  if (velocity === null || velocity === undefined) return null;
  return Math.hypot(velocity.x, velocity.z);
}

function localPlanarDelta(before, after, yawMilliDegrees) {
  if (before === null || before === undefined
    || after === null || after === undefined
    || yawMilliDegrees === null || yawMilliDegrees === undefined) {
    return null;
  }
  const yaw = yawMilliDegrees * Math.PI / 180_000;
  const deltaX = after.x - before.x;
  const deltaZ = after.z - before.z;
  return {
    forwardMillimeters: deltaX * Math.sin(yaw) + deltaZ * Math.cos(yaw),
    rightMillimeters: deltaX * Math.cos(yaw) - deltaZ * Math.sin(yaw),
  };
}

async function waitForGrounded(page, timeoutMilliseconds = 4_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const value = await snapshot(page);
    if (value?.localAuthoritativeGrounded === true) return value;
    await delay(60);
  }
  return await snapshot(page);
}

async function waitForSnapshotPredicate(
  page,
  predicate,
  timeoutMilliseconds = 5_000,
) {
  const deadline = Date.now() + timeoutMilliseconds;
  let latest = await snapshot(page);
  while (Date.now() < deadline) {
    if (predicate(latest)) return latest;
    await delay(60);
    latest = await snapshot(page);
  }
  return latest;
}

async function releaseGameplayInputs(page) {
  for (const code of [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'ShiftLeft',
    'ControlLeft',
    'Enter',
    'Tab',
  ]) {
    await page?.keyboard.up(code).catch(() => undefined);
  }
  await page?.mouse.up({ button: 'left' }).catch(() => undefined);
  await page?.mouse.up({ button: 'right' }).catch(() => undefined);
}

let wrangler = null;
let vite = null;
let browser = null;
let hostContext = null;
let guestContext = null;
let hostPage = null;
let guestPage = null;
let createdDistPlaceholder = false;

const temporaryRoot = path.resolve(os.tmpdir());
const authorityState = await fs.mkdtemp(
  path.join(temporaryRoot, 'kyx-fable5-audit-authority-'),
);

let matchJoined = false;

try {
  await stage('boot_services', async () => {
    // wrangler.jsonc points assets.directory at ./dist; a fresh worktree has
    // no build output yet, and wrangler refuses to boot without the directory.
    const distDirectory = path.join(repo, 'dist');
    try {
      await fs.access(distDirectory);
    } catch {
      await fs.mkdir(distDirectory, { recursive: true });
      await fs.writeFile(
        path.join(distDirectory, 'audit-placeholder.txt'),
        'Created by capture-fable5-full-game-audit.mjs for wrangler dev only.\n',
        'utf8',
      );
      createdDistPlaceholder = true;
    }
    wrangler = service([
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--local',
      '--port',
      String(AUTHORITY_PORT),
      '--persist-to',
      authorityState,
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
        '--mode',
        'staging-review',
      ],
      { ...process.env, VITE_KYX_AUTHORITY_ORIGIN: AUTHORITY_ORIGIN },
    );
    try {
      await Promise.all([
        waitForHttp(`${AUTHORITY_ORIGIN}/health`, 150_000),
        waitForHttp(`${FRONTEND_ORIGIN}/online`, 150_000),
      ]);
    } catch (error) {
      throw new Error(
        `${String(error?.message ?? error)}\nwrangler tail: ${
          wrangler?.lines.slice(-12).join(' | ') ?? 'none'
        }\nvite tail: ${vite?.lines.slice(-6).join(' | ') ?? 'none'}`,
      );
    }
    return auditResult('passed', {
      authorityOrigin: AUTHORITY_ORIGIN,
      frontendOrigin: FRONTEND_ORIGIN,
    });
  });

  await stage('boot_browser', async () => {
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
        // Try the next location.
      }
    }
    browser = await chromium.launch({
      executablePath: chromeExecutable ?? undefined,
      headless: true,
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-gpu',
        '--enable-gpu-rasterization',
        '--use-angle=d3d11',
      ],
    });
    hostContext = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    guestContext = await browser.newContext({
      viewport: { width: 1_440, height: 900 },
    });
    for (const [context, name] of [
      [hostContext, 'Audit Host'],
      [guestContext, 'Audit Guest'],
    ]) {
      await context.addInitScript((displayName) => {
        try {
          localStorage.setItem(
            'kyx_local_profile',
            JSON.stringify({ kind: 'local_guest', version: 1, displayName }),
          );
        } catch {
          // Opaque-origin documents (about:blank) deny storage; real
          // navigations run this again with access.
        }
      }, name);
    }
    hostPage = await hostContext.newPage();
    guestPage = await guestContext.newPage();
    for (const [page, label] of [[hostPage, 'host'], [guestPage, 'guest']]) {
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(`${label}: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => {
        pageErrors.push(`${label}: ${error.message}`);
      });
    }
    return auditResult('passed', {
      executable: chromeExecutable ?? 'playwright-bundled',
    });
  });

  await stage('lobby_cold_eye', async () => {
    await hostPage.goto(`${FRONTEND_ORIGIN}/online`, {
      waitUntil: 'domcontentloaded',
    });
    await hostPage.waitForFunction(
      () => document.body.dataset.onlinePreviewStatus === 'lobby',
      undefined,
      { timeout: 60_000 },
    );
    const lobbyShot = await shoot(hostPage, '00-lobby-cold-eye.png', true);
    const inventory = await hostPage.evaluate(() => {
      const ids = [...document.querySelectorAll('[data-testid]')]
        .map((node) => node.dataset.testid);
      const buttons = [...document.querySelectorAll('button, a')]
        .map((node) => node.textContent?.replace(/\s+/gu, ' ').trim())
        .filter(Boolean)
        .slice(0, 60);
      return { testids: [...new Set(ids)].slice(0, 120), buttons };
    });
    return auditResult(
      'partial',
      { lobbyShot, inventory, reachabilityVerified: true },
      {
        severity: 'human-review-required',
        summary: 'Lobby reachability is automated; composition and visual quality are not approved.',
      },
    );
  });

  await stage('create_and_join_two_clients', async () => {
    await hostPage.getByTestId('online-create-room').click();
    await hostPage.waitForFunction(() => (
      document.body.dataset.onlinePreviewStatus === 'joined'
      && document.body.dataset.online3dStatus === 'ready'
    ), undefined, { timeout: 90_000 });
    const inviteUrl = hostPage.url();
    await guestPage.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
    await guestPage.waitForFunction(() => (
      document.body.dataset.onlinePreviewStatus === 'joined'
      && document.body.dataset.online3dStatus === 'ready'
    ), undefined, { timeout: 90_000 });
    await hostPage.waitForFunction(() => {
      const value = globalThis.__KYX_ONLINE_PREVIEW__?.getSnapshot();
      return value?.connection === 'joined'
        && value.render3d?.status === 'ready'
        && value.render3d.remoteAvatarCount === 1
        && value.combat.snapshot?.players.length === 2
        && value.localAuthoritativePosition !== null;
    }, undefined, { timeout: 90_000 });
    const joined = await snapshot(hostPage);
    const graphics = await hostPage.evaluate(() => {
      const canvas = document.querySelector('.online-session__canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (context === null) return null;
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      return debug === null
        ? null
        : context.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    });
    const spawnShot = await shoot(hostPage, '01-two-client-spawn.png');
    const hudShot = await shoot(hostPage, '01b-hud-full-1440x900.png', true);
    // Engage pointer lock so the HUD captures reflect actual play chrome.
    await hostPage.locator('.online-session__canvas').click().catch(
      () => undefined,
    );
    await delay(650);
    const pointerLockState = await hostPage.evaluate(() => ({
      locked: document.pointerLockElement !== null,
      canvasFlag: document.querySelector('.online-session__canvas')
        ?.dataset.pointerLock ?? null,
      appBarVisible: (() => {
        const bar = document.querySelector('.online-preview__bar');
        return bar === null
          ? null
          : getComputedStyle(bar).display !== 'none';
      })(),
    }));
    const immersionShot = await shoot(
      hostPage,
      '01c-hud-pointer-locked.png',
      true,
    );
    matchJoined = true;
    return auditResult('passed', {
      inviteUrl: '(recorded-local-only)',
      pointerLockState,
      immersionShot,
      renderer: graphics,
      presentationSha256: joined?.render3d?.presentationSha256 ?? null,
      renderMeshCount: joined?.render3d?.renderMeshCount ?? null,
      colliders: joined?.render3d?.authorityColliderCount ?? null,
      weaponVisualSource:
        joined?.render3d?.selectedWeaponVisualSource ?? null,
      spawnShot,
      hudShot,
    });
  });

  await stage('movement_probe', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const samples = [];
    const canvas = hostPage.locator('.online-session__canvas');
    await canvas.hover().catch(() => undefined);
    try {
      const before = await waitForGrounded(hostPage);
      await hostPage.keyboard.down('KeyW');
      for (let index = 0; index < 8; index += 1) {
        await delay(220);
        const value = await snapshot(hostPage);
        samples.push({
          t: (index + 1) * 220,
          position: value?.localAuthoritativePosition ?? null,
          velocity: value?.localAuthoritativeVelocity ?? null,
          horizontalSpeedMillimetersPerSecond: horizontalSpeed(
            value?.localAuthoritativeVelocity,
          ),
        });
      }
      await hostPage.keyboard.up('KeyW');
      await delay(350);
      const afterForward = await snapshot(hostPage);

      const grounded = await waitForGrounded(hostPage);
      const jumpSamples = [];
      await hostPage.keyboard.press('Space');
      for (let index = 0; index < 32; index += 1) {
        await delay(60);
        const value = await snapshot(hostPage);
        jumpSamples.push({
          t: (index + 1) * 60,
          grounded: value?.localAuthoritativeGrounded ?? null,
          y: value?.localAuthoritativePosition?.y ?? null,
          verticalSpeedMillimetersPerSecond:
            value?.localAuthoritativeVelocity?.y ?? null,
        });
      }

      const beforeLeft = await snapshot(hostPage);
      await hostPage.keyboard.down('KeyA');
      await delay(420);
      await hostPage.keyboard.up('KeyA');
      await delay(120);
      const afterLeft = await snapshot(hostPage);
      const beforeRight = afterLeft;
      await hostPage.keyboard.down('KeyD');
      await delay(420);
      await hostPage.keyboard.up('KeyD');
      await delay(120);
      const afterRight = await snapshot(hostPage);

      const forwardDisplacement = horizontalDistance(
        before?.localAuthoritativePosition,
        afterForward?.localAuthoritativePosition,
      );
      const leftDisplacement = horizontalDistance(
        beforeLeft?.localAuthoritativePosition,
        afterLeft?.localAuthoritativePosition,
      );
      const rightDisplacement = horizontalDistance(
        beforeRight?.localAuthoritativePosition,
        afterRight?.localAuthoritativePosition,
      );
      const leftLocalDelta = localPlanarDelta(
        beforeLeft?.localAuthoritativePosition,
        afterLeft?.localAuthoritativePosition,
        beforeLeft?.localAuthoritativeYawMilliDegrees,
      );
      const rightLocalDelta = localPlanarDelta(
        beforeRight?.localAuthoritativePosition,
        afterRight?.localAuthoritativePosition,
        beforeRight?.localAuthoritativeYawMilliDegrees,
      );
      const airborneObserved = jumpSamples.some(({ grounded: value }) => value === false);
      const landedAfterAirborne = airborneObserved
        && jumpSamples.slice(
          jumpSamples.findIndex(({ grounded: value }) => value === false) + 1,
        ).some(({ grounded: value }) => value === true);
      const mechanicsObserved = (forwardDisplacement ?? 0) > 0
        && (leftDisplacement ?? 0) > 0
        && (rightDisplacement ?? 0) > 0
        && (leftLocalDelta?.rightMillimeters ?? 0) < 0
        && (rightLocalDelta?.rightMillimeters ?? 0) > 0
        && grounded?.localAuthoritativeGrounded === true
        && airborneObserved
        && landedAfterAirborne;
      const detail = {
        forwardDisplacementMillimeters: forwardDisplacement,
        leftDisplacementMillimeters: leftDisplacement,
        rightDisplacementMillimeters: rightDisplacement,
        leftLocalDelta,
        rightLocalDelta,
        samples,
        jump: {
          groundedBefore: grounded?.localAuthoritativeGrounded ?? null,
          airborneObserved,
          landedAfterAirborne,
          samples: jumpSamples,
        },
      };
      return auditResult(
        mechanicsObserved ? 'partial' : 'unknown',
        detail,
        {
          severity: mechanicsObserved ? 'human-review-required' : 'mechanics-unproven',
          summary: mechanicsObserved
            ? 'Authoritative forward, strafe, jump, and landing mechanics were observed; cadence, weight, animation, and feel still require human play.'
            : 'The movement probe did not observe the complete forward/strafe/jump/land sequence.',
        },
      );
    } finally {
      await releaseGameplayInputs(hostPage);
    }
  });

  await stage('weapon_roster_composition', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const selectedLoadout = await hostPage.evaluate(() => ({
      stored: localStorage.getItem('sio_loadout'),
      presetId: document.body.dataset.combatPresetId ?? null,
      helmetVariantId: document.body.dataset.helmetVariantId ?? null,
    }));
    const rail = await hostPage.evaluate(() => (
      [...document.querySelectorAll('.online-session__weapon-slot')].map(
        (button) => ({
          slot: button.dataset.slot,
          active: button.dataset.active,
          allowed: button.dataset.presetAllowed,
          disabled: button.disabled,
          label: button.textContent?.replace(/\s+/gu, ' ').trim(),
        }),
      )
    ));
    const perWeapon = [];
    try {
      for (const entry of rail) {
        if (entry.disabled) continue;
        const slot = Number(entry.slot);
        await hostPage.keyboard.press(`Digit${slot + 1}`);
        await delay(950);
        const value = await snapshot(hostPage);
        const local = localPlayer(value);
        const weaponBefore = local?.weapons?.find(
          ({ weaponId }) => weaponId === local.selectedWeaponId,
        ) ?? null;
        const hip = await shoot(
          hostPage,
          `02-weapon-slot${slot}-hip.png`,
        );
        await hostPage.mouse.move(720, 450);
        await hostPage.mouse.down({ button: 'right' });
        await delay(650);
        const ads = await shoot(
          hostPage,
          `02-weapon-slot${slot}-ads.png`,
        );
        const adsValue = await snapshot(hostPage);
        await hostPage.mouse.up({ button: 'right' });
        await delay(350);
        await hostPage.keyboard.down('Enter');
        await delay(420);
        const fire = await shoot(
          hostPage,
          `02-weapon-slot${slot}-fire.png`,
        );
        await hostPage.keyboard.up('Enter');
        await delay(300);
        const afterFire = await snapshot(hostPage);
        const localAfterFire = localPlayer(afterFire);
        const weaponAfter = localAfterFire?.weapons?.find(
          ({ weaponId }) => weaponId === localAfterFire.selectedWeaponId,
        ) ?? null;
        await hostPage.keyboard.press('KeyR');
        await delay(700);
        const reload = await shoot(
          hostPage,
          `02-weapon-slot${slot}-reload.png`,
        );
        await delay(2_600);
        perWeapon.push({
          slot,
          label: entry.label,
          selectedWeaponId: local?.selectedWeaponId ?? null,
          weaponFamily: weaponBefore?.family ?? null,
          attackModel: weaponBefore?.attackModel ?? null,
          acceptedAttackCountBefore: weaponBefore?.acceptedAttackCount ?? null,
          acceptedAttackCountAfter: weaponAfter?.acceptedAttackCount ?? null,
          visualSource: value?.render3d?.selectedWeaponVisualSource ?? null,
          contactMode: value?.render3d?.selectedFirstPersonContactMode ?? null,
          handCount: value?.render3d?.selectedFirstPersonHandCount ?? null,
          adsMix: adsValue?.render3d?.selectedFirstPersonAimMix ?? null,
          adsFov: adsValue?.render3d?.selectedFirstPersonFieldOfViewDegrees
            ?? null,
          shots: { hip, ads, fire, reload },
        });
      }
      await hostPage.keyboard.press('Digit1');
      await delay(600);
      return auditResult(
        'partial',
        { selectedLoadout, rail, perWeapon },
        {
          severity: 'coverage-gap',
          summary: 'This live room covers only the selected preset roster; the four role presets and every weapon family still require parameterized runtime coverage and human weapon-contact review.',
        },
      );
    } finally {
      await releaseGameplayInputs(hostPage);
    }
  });

  await stage('abilities', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const canvas = hostPage.locator('.online-session__canvas');
    await canvas.hover().catch(() => undefined);
    const result = {};
    try {
      const activationCounts = (value) => localPlayer(value)
        ?.abilityLoadout?.acceptedActivationCounts ?? null;
      const beforeAbilities = await snapshot(hostPage);
      // Blink preview hold (Q), capture preview, then commit.
      await hostPage.keyboard.down('KeyQ');
      await delay(650);
      result.blinkPreviewShot = await shoot(hostPage, '03-blink-preview.png');
      const preview = await snapshot(hostPage);
    result.blinkPreview = {
      active: preview?.render3d?.blinkPreviewActive ?? null,
      valid: preview?.render3d?.blinkPreviewValid ?? null,
      reason: preview?.render3d?.blinkPreviewReason ?? null,
      authorityBound: preview?.render3d?.blinkPreviewAuthorityBound ?? null,
      distanceMillimeters:
        preview?.render3d?.blinkPreviewDistanceMillimeters ?? null,
      maximumRangeMillimeters:
        preview?.render3d?.blinkPreviewMaximumRangeMillimeters ?? null,
    };
      // While the same preview remains held, pitch toward the floor ahead and
      // record the grounded-destination-friendly variant. Releasing Q only
      // once avoids accidentally consuming Blink before the second sample.
      await tapLook(hostPage, 'ArrowDown', 6);
      await delay(650);
      const pitched = await snapshot(hostPage);
    result.blinkPreviewPitchedDown = {
      valid: pitched?.render3d?.blinkPreviewValid ?? null,
      reason: pitched?.render3d?.blinkPreviewReason ?? null,
      distanceMillimeters:
        pitched?.render3d?.blinkPreviewDistanceMillimeters ?? null,
    };
    result.blinkPitchedShot = await shoot(
      hostPage,
      '03-blink-preview-pitched.png',
    );
      if (pitched?.render3d?.blinkPreviewValid !== true
        && preview?.render3d?.blinkPreviewValid === true) {
        await tapLook(hostPage, 'ArrowUp', 6);
      }
      const positionBefore = (await snapshot(hostPage))
        ?.localAuthoritativePosition ?? null;
      await hostPage.keyboard.up('KeyQ');
      const afterBlink = await waitForSnapshotPredicate(
        hostPage,
        (value) => horizontalDistance(
          positionBefore,
          value?.localAuthoritativePosition,
        ) > 250,
        2_000,
      );
      if (pitched?.render3d?.blinkPreviewValid === true) {
        await tapLook(hostPage, 'ArrowUp', 6);
      }
    result.blinkCommit = {
      positionBefore,
      positionAfter: afterBlink?.localAuthoritativePosition ?? null,
    };
      result.blinkArrivalShot = await shoot(hostPage, '03b-blink-arrival.png');
      // Launch (E).
      const beforeLaunch = activationCounts(afterBlink);
      await hostPage.keyboard.press('KeyE');
      const afterLaunch = await waitForSnapshotPredicate(
        hostPage,
        (value) => (activationCounts(value)?.[0] ?? -1) > (beforeLaunch?.[0] ?? -1),
      );
      result.launchObservedShot = await shoot(hostPage, '03c-launch-observation.png');
      // Smoke (F): capture an accepted observation and later expansion state.
      const beforeSmoke = activationCounts(afterLaunch);
      await hostPage.keyboard.press('KeyF');
      const afterSmoke = await waitForSnapshotPredicate(
        hostPage,
        (value) => (activationCounts(value)?.[1] ?? -1) > (beforeSmoke?.[1] ?? -1),
      );
      result.smokeAcceptedShot = await shoot(hostPage, '03d-smoke-accepted.png');
      await delay(1_600);
      result.smokeLaterShot = await shoot(hostPage, '03e-smoke-later.png');
      // Frag (Z): record observations without assuming flight/detonation timing.
      const beforeFrag = activationCounts(await snapshot(hostPage));
      await hostPage.keyboard.press('KeyZ');
      const afterFrag = await waitForSnapshotPredicate(
        hostPage,
        (value) => (activationCounts(value)?.[2] ?? -1) > (beforeFrag?.[2] ?? -1),
      );
      result.fragObservationA = await shoot(hostPage, '03f-frag-observation-a.png');
      await delay(1_500);
      result.fragObservationB = await shoot(hostPage, '03g-frag-observation-b.png');
      const abilityState = await snapshot(hostPage);
    result.abilityDiagnostics = {
      grenades: abilityState?.render3d?.grenadeProjectileCount ?? null,
      effects: abilityState?.render3d?.activeWeaponEffectCount ?? null,
    };
      result.activationCounts = {
        before: activationCounts(beforeAbilities),
        afterLaunch: activationCounts(afterLaunch),
        afterSmoke: activationCounts(afterSmoke),
        afterFrag: activationCounts(afterFrag),
        final: activationCounts(abilityState),
      };
      result.presentationCues = abilityState?.presentation?.recentCues ?? [];
      result.blinkCommit.distanceMillimeters = horizontalDistance(
        positionBefore,
        afterBlink?.localAuthoritativePosition,
      );
      return auditResult(
        'partial',
        result,
        {
          severity: 'coverage-gap',
          summary: 'Authority counters and Blink displacement are sampled, but bounce/weight, smoke radius and smoothness, victim readability, damage, and each role-specific ability set still require dedicated proof and human play.',
        },
      );
    } finally {
      await releaseGameplayInputs(hostPage);
    }
  });

  await stage('combat_damage_kill_respawn', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const result = {
      engagements: [],
      damageObserved: false,
      killObserved: false,
      respawnObserved: false,
      headshotCueObserved: false,
    };
    const durability = (player) => player === null || player === undefined
      ? null
      : player.healthPoints + player.shieldPoints;
    try {
      await hostPage.keyboard.press('Digit1');
      await delay(700);
      const first = await snapshot(hostPage);
      result.remotePlayerKeys = Object.keys(remotePlayer(first) ?? {});
      result.remoteEntityKeys = Object.keys(remoteEntity(first) ?? {});
      result.presentationCueCountBefore = first?.presentation?.recentCues?.length ?? 0;

      for (let attempt = 0; attempt < 36; attempt += 1) {
        const value = await snapshot(hostPage);
        const enemy = remotePlayer(value);
        const enemyAt = remoteEntity(value)?.position ?? null;
        const self = value?.localAuthoritativePosition ?? null;
        if (enemy === null || enemyAt === null || self === null) break;
        const distance = horizontalDistance(self, enemyAt);
        await rotateToYaw(hostPage, headingToMapTarget(self, enemyAt));
        if ((distance ?? Infinity) > 8_000) {
          await hostPage.keyboard.down('KeyW');
          await delay(Math.min(650, (distance ?? 0) / 16));
          await hostPage.keyboard.up('KeyW');
          await delay(260);
          continue;
        }

        const healthBefore = enemy.healthPoints;
        const shieldBefore = enemy.shieldPoints;
        const durabilityBefore = durability(enemy);
        const selectedBefore = enemy.selectedWeaponId;
        const attackerBefore = localPlayer(value);
        const attackCountBefore = attackerBefore?.weapons?.find(
          ({ weaponId }) => weaponId === attackerBefore.selectedWeaponId,
        )?.acceptedAttackCount ?? null;
        await hostPage.keyboard.down('Enter');
        await delay(720);
        await hostPage.keyboard.up('Enter');
        const after = await waitForSnapshotPredicate(
          hostPage,
          (candidate) => {
            const remote = remotePlayer(candidate);
            const attacker = localPlayer(candidate);
            const attackCount = attacker?.weapons?.find(
              ({ weaponId }) => weaponId === attacker.selectedWeaponId,
            )?.acceptedAttackCount ?? null;
            return (durability(remote) ?? Infinity) < (durabilityBefore ?? -Infinity)
              || (attackCount ?? -1) > (attackCountBefore ?? -1);
          },
          1_800,
        );
        const enemyAfter = remotePlayer(after);
        const attackerAfter = localPlayer(after);
        const attackCountAfter = attackerAfter?.weapons?.find(
          ({ weaponId }) => weaponId === attackerAfter.selectedWeaponId,
        )?.acceptedAttackCount ?? null;
        const cues = after?.presentation?.recentCues ?? [];
        const damaged = (durability(enemyAfter) ?? Infinity)
          < (durabilityBefore ?? -Infinity);
        const killed = enemyAfter?.lifePhase === 'dead';
        result.headshotCueObserved ||= cues.some(
          ({ cue }) => cue === 'head' || cue === 'head_kill',
        );
        result.engagements.push({
          attempt,
          distanceMillimeters: distance === null ? null : Math.round(distance),
          attackerWeaponId: attackerAfter?.selectedWeaponId ?? null,
          attackCountBefore,
          attackCountAfter,
          enemyWeaponIdBefore: selectedBefore ?? null,
          enemyHealthBefore: healthBefore,
          enemyHealthAfter: enemyAfter?.healthPoints ?? null,
          enemyShieldBefore: shieldBefore,
          enemyShieldAfter: enemyAfter?.shieldPoints ?? null,
          enemyLifePhase: enemyAfter?.lifePhase ?? null,
          damaged,
          killed,
          recentCues: cues,
          hostScore: after?.combat?.snapshot?.match ?? null,
        });
        if (damaged && !result.damageObserved) {
          result.damageObserved = true;
          result.damageShot = await shoot(hostPage, '04-damage-confirmed.png');
          result.guestDamageShot = await shoot(
            guestPage,
            '04b-guest-damage-received.png',
          );
        }
        if (killed) {
          result.killObserved = true;
          result.killShot = await shoot(hostPage, '04c-kill-confirmed.png');
          result.guestDeathShot = await shoot(guestPage, '04d-guest-death.png');
          const respawned = await waitForSnapshotPredicate(
            guestPage,
            (candidate) => localPlayer(candidate)?.lifePhase === 'alive'
              && (localPlayer(candidate)?.healthPoints ?? 0) > 0,
            8_000,
          );
          result.respawnObserved = localPlayer(respawned)?.lifePhase === 'alive';
          result.guestRespawnShot = await shoot(
            guestPage,
            '04e-guest-respawn-observation.png',
          );
          result.respawn = {
            guestPosition: respawned?.localAuthoritativePosition ?? null,
            guestHealthPoints: localPlayer(respawned)?.healthPoints ?? null,
            guestShieldPoints: localPlayer(respawned)?.shieldPoints ?? null,
            guestLifePhase: localPlayer(respawned)?.lifePhase ?? null,
          };
          break;
        }
      }
      const final = await snapshot(hostPage);
      result.finalMatch = final?.combat?.snapshot?.match ?? null;
      result.presentationCues = final?.presentation?.recentCues ?? [];
      const completeSequence = result.damageObserved
        && result.killObserved
        && result.respawnObserved;
      return auditResult(
        completeSequence || result.damageObserved ? 'partial' : 'unknown',
        result,
        {
          severity: completeSequence
            ? 'human-review-required'
            : 'combat-proof-incomplete',
          summary: completeSequence
            ? 'Authority damage, kill, and respawn were observed; headshot readability, kill-banner quality, animation, audio, and feel remain human-review items.'
            : result.damageObserved
              ? 'Damage was observed, but the full kill/death/respawn sequence was not completed.'
              : 'No authoritative victim damage was observed; weapon input alone is not combat proof.',
        },
      );
    } finally {
      await releaseGameplayInputs(hostPage);
    }
  });

  await stage('scoreboard_probe', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    await hostPage.keyboard.down('Tab');
    await delay(500);
    const domScoreboard = await hostPage.evaluate(() => {
      const nodes = [...document.querySelectorAll('[class*="scoreboard" i], [data-testid*="scoreboard" i]')];
      return nodes.map((node) => node.className).slice(0, 5);
    });
    const shot = await shoot(hostPage, '05-tab-scoreboard.png', true);
    await hostPage.keyboard.up('Tab');
    const detail = { domScoreboard, shot, present: domScoreboard.length > 0 };
    return auditResult(
      detail.present ? 'partial' : 'unknown',
      detail,
      {
        severity: detail.present ? 'human-review-required' : 'hud-unproven',
        summary: detail.present
          ? 'The hold-Tab scoreboard is present; opacity, density, scale, and visual fit still require human review.'
          : 'The hold-Tab scoreboard was not found.',
      },
    );
  });

  await stage('refresh_rejoin', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const before = await snapshot(guestPage);
    const playerIdBefore = before?.playerId ?? null;
    const scoreBefore = before?.combat?.snapshot?.match ?? null;
    await guestPage.reload({ waitUntil: 'domcontentloaded' });
    const bannerShot = await shoot(
      guestPage,
      '06-reconnect-inflight.png',
      true,
    ).catch(() => null);
    await guestPage.waitForFunction(() => (
      document.body.dataset.onlinePreviewStatus === 'joined'
      && document.body.dataset.online3dStatus === 'ready'
    ), undefined, { timeout: 90_000 });
    await delay(900);
    const after = await snapshot(guestPage);
    const resumedShot = await shoot(guestPage, '06b-reconnect-resumed.png');
    const detail = {
      bannerShot,
      resumedShot,
      playerIdPreserved: playerIdBefore !== null
        && after?.playerId === playerIdBefore,
      scoreBefore,
      scoreAfter: after?.combat?.snapshot?.match ?? null,
      hostRemoteAvatarCount:
        (await snapshot(hostPage))?.render3d?.remoteAvatarCount ?? null,
      guestPlayersSeen:
        after?.combat?.snapshot?.players?.length ?? null,
    };
    return auditResult(
      'partial',
      detail,
      {
        severity: 'scope-limit',
        summary: 'This stage observes browser refresh/rejoin only. It does not exercise or judge the product secure-resume path.',
      },
    );
  });

  await stage('performance_sample', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    await hostPage.evaluate(() => {
      const state = {
        frames: [],
        longTasks: [],
        running: true,
        startedAt: performance.now(),
        stoppedAt: null,
      };
      globalThis.__FABLE5_PERF__ = state;
      let previous = performance.now();
      const tick = (now) => {
        if (!state.running) return;
        state.frames.push(now - previous);
        previous = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            state.longTasks.push(Math.round(entry.duration));
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        state.longTasks = null;
      }
    });
    try {
      // Generate bounded two-client load: strafe + fire bursts. The sampler
      // remains active until all scripted load and the settle window finish.
      for (let index = 0; index < 4; index += 1) {
        await hostPage.keyboard.down(index % 2 === 0 ? 'KeyA' : 'KeyD');
        await hostPage.keyboard.down('Enter');
        await delay(900);
        await hostPage.keyboard.up('Enter');
        await hostPage.keyboard.up(index % 2 === 0 ? 'KeyA' : 'KeyD');
        await delay(250);
      }
      await delay(4_500);
    } finally {
      await releaseGameplayInputs(hostPage);
      await hostPage.evaluate(() => {
        const state = globalThis.__FABLE5_PERF__;
        if (state !== undefined) {
          state.running = false;
          state.stoppedAt = performance.now();
        }
      });
    }
    const perf = await hostPage.evaluate(() => {
      const state = globalThis.__FABLE5_PERF__;
      const frames = [...(state?.frames ?? [])].sort((a, b) => a - b);
      const pick = (ratio) => frames.length === 0
        ? null
        : Number(frames[Math.min(
            frames.length - 1,
            Math.floor(frames.length * ratio),
          )].toFixed(2));
      const memory = performance

        .memory === undefined
        ? null
        : {
            usedJsHeapMb: Math.round(
              performance.memory.usedJSHeapSize / 1_048_576,
            ),
            totalJsHeapMb: Math.round(
              performance.memory.totalJSHeapSize / 1_048_576,
            ),
          };
      return {
        sampleCount: frames.length,
        p50: pick(0.5),
        p95: pick(0.95),
        p99: pick(0.99),
        worst: frames.length === 0
          ? null
          : Number(frames[frames.length - 1].toFixed(2)),
        longTasks: state?.longTasks ?? null,
        durationMilliseconds: state?.stoppedAt === null
          ? null
          : Number((state.stoppedAt - state.startedAt).toFixed(2)),
        memory,
      };
    });
    return auditResult(
      'partial',
      perf,
      {
        severity: 'scope-limit',
        summary: 'Performance sampling spans the scripted load, but remains headless two-client evidence and cannot stand in for the required 2/4/8 combat matrix or human hardware experience.',
      },
    );
  });

  await stage('hud_viewport_matrix', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const samples = {};
    const sampleViewport = async (name, width, height, filename) => {
      await hostPage.setViewportSize({ width, height });
      await delay(700);
      const shot = await shoot(hostPage, filename, true);
      const layout = await hostPage.evaluate(() => ({
        abilityLabels: [...document.querySelectorAll('.online-session__ability-name')]
          .map((node) => ({
            text: node.textContent?.trim() ?? '',
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            clipped: node.scrollWidth > node.clientWidth + 1,
          })),
        horizontalOverflow: document.documentElement.scrollWidth
          > document.documentElement.clientWidth + 1,
        hudContract: document.body.dataset.onlineHud ?? null,
        uiSystem: document.body.dataset.uiSystem ?? null,
      }));
      samples[name] = { width, height, shot, layout };
    };
    await sampleViewport('fullHd', 1_920, 1_080, '07-hud-1920x1080.png');
    await sampleViewport('narrow', 1_024, 640, '07b-hud-1024x640.png');
    await sampleViewport('ultrawide', 2_560, 1_080, '07c-hud-2560x1080.png');
    await hostPage.setViewportSize({ width: 1_440, height: 900 });
    await delay(500);
    const clipped = Object.values(samples).flatMap(
      ({ layout }) => layout.abilityLabels.filter(({ clipped: value }) => value),
    );
    return auditResult(
      'partial',
      { samples, clippedAbilityLabels: clipped },
      {
        severity: clipped.length === 0 ? 'human-review-required' : 'layout-defect',
        summary: clipped.length === 0
          ? 'Representative desktop HUD viewports fit mechanically; hierarchy, density, consistency, and style still require human review.'
          : `HUD ability text clips in ${clipped.length} measured viewport occurrences.`,
      },
    );
  });

  await stage('practice_parity_probe', async () => {
    const practicePage = await hostContext.newPage();
    const result = {};
    try {
      await practicePage.goto(`${FRONTEND_ORIGIN}/`, {
        waitUntil: 'domcontentloaded',
      });
      await delay(1_200);
      result.practiceMapTitle = await practicePage.locator('#practice-title')
        .textContent().catch(() => null);
      result.onlineMapReference = await hostPage.evaluate(
        () => document.body.dataset.onlineMapReference ?? null,
      );
      const links = await practicePage.evaluate(() => (
        [...document.querySelectorAll('a, button')]
          .map((node) => ({
            text: node.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
            href: node.getAttribute?.('href') ?? null,
            testid: node.dataset?.testid ?? null,
          }))
          .filter(({ text }) => text.length > 0)
          .slice(0, 40)
      ));
      result.landingLinks = links;
      result.landingShot = await shoot(practicePage, '08-landing.png', true);
      const settingsButton = practicePage.locator(
        'button[data-panel="settings"]',
      );
      if (await settingsButton.count() > 0) {
        await settingsButton.first().click().catch(() => undefined);
        await delay(700);
        result.settingsShot = await shoot(
          practicePage,
          '08c-settings-panel.png',
          true,
        );
        await practicePage.keyboard.press('Escape').catch(() => undefined);
        await delay(400);
      }
      const startPractice = practicePage.locator('#play-btn');
      if (await startPractice.count() > 0) {
        await startPractice.first().click();
        await practicePage.locator('#hud:not(.hidden)')
          .waitFor({ state: 'visible', timeout: 15_000 });
        await delay(1_500);
        result.practiceShot = await shoot(
          practicePage,
          '08b-practice-entry.png',
          true,
        );
        const practiceHud = await practicePage.evaluate(() => ({
          weaponRailSlots: document.querySelector('#weapon-slots')
            ?.children.length ?? 0,
          abilityRack: document.querySelector('#ability-rack') !== null,
          abilitySlots: document.querySelectorAll('#ability-rack .ability-slot').length,
          hudVisible: !document.querySelector('#hud')?.classList.contains('hidden'),
          weaponName: document.querySelector('#weapon-name')?.textContent?.trim() ?? null,
          hudRoot: document.body.dataset.uiSystem ?? null,
        }));
        result.practiceHud = practiceHud;
        await delay(2_000);
        result.practiceLateShot = await shoot(
          practicePage,
          '08d-practice-30s-later.png',
          true,
        );
      } else {
        result.practiceShot = null;
        result.practiceNote = 'No #play-btn practice entry was discovered.';
      }
    } finally {
      await practicePage.close().catch(() => undefined);
    }
    const practiceStarted = result.practiceHud?.hudVisible === true;
    const mapConverged = /inkfall/iu.test(result.practiceMapTitle ?? '');
    return auditResult(
      practiceStarted ? 'partial' : 'unknown',
      { ...result, mapConverged },
      {
        severity: mapConverged ? 'human-review-required' : 'product-divergence',
        summary: mapConverged
          ? 'Practice launched on the same named map family; full gameplay/HUD parity still requires review.'
          : 'Practice launches, but it still identifies as Iron Bastion while online uses Inkfall Foundry; Practice/online convergence is not complete.',
      },
    );
  });
} finally {
  if (consoleErrors.length > 0) {
    recordFinding(
      'runtime_errors',
      'console-error',
      `${consoleErrors.length} browser console error(s) were captured.`,
      consoleErrors.slice(0, 20),
    );
  }
  if (pageErrors.length > 0) {
    recordFinding(
      'runtime_errors',
      'page-error',
      `${pageErrors.length} uncaught page error(s) were captured.`,
      pageErrors.slice(0, 20),
    );
  }
  const report = {
    harness: 'fable5-full-game-audit-v2',
    harnessSha256,
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    repository: {
      head: repositoryHead,
      branch: repositoryBranch,
      statusShort: repositoryStatus === '' ? 'clean' : repositoryStatus,
    },
    coverage: auditCoverageLedger(),
    stages,
    findings,
    consoleErrors: consoleErrors.slice(0, 60),
    pageErrors: pageErrors.slice(0, 60),
  };
  await fs.writeFile(
    path.join(output, 'audit-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await Promise.allSettled([
    hostPage?.close(),
    guestPage?.close(),
    hostContext?.close(),
    guestContext?.close(),
    browser?.close(),
  ]);
  await stopService(vite);
  await stopService(wrangler);
  await fs.rm(authorityState, { recursive: true, force: true });
  if (createdDistPlaceholder) {
    await fs.rm(path.join(repo, 'dist', 'audit-placeholder.txt'), {
      force: true,
    });
  }
  process.stdout.write(`AUDIT_REPORT ${path.join(output, 'audit-report.json')}\n`);
  const failedStages = Object.entries(stages)
    .filter(([, value]) => value.status === 'failed')
    .map(([name]) => name);
  process.stdout.write(`AUDIT_STAGES_FAILED ${JSON.stringify(failedStages)}\n`);
  const nonPassedStages = Object.entries(stages)
    .filter(([, value]) => value.status !== 'passed')
    .map(([name, value]) => ({ name, status: value.status }));
  process.stdout.write(`AUDIT_STAGES_NON_PASS ${JSON.stringify(nonPassedStages)}\n`);
}
