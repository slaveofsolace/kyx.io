import { spawn, execFileSync } from 'node:child_process';
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
const outputArgument = process.argv[2];
const output = path.resolve(
  repo,
  outputArgument ?? 'evidence/2026-07-31/fable5-full-game-audit',
);
const screenshots = path.join(output, 'screenshots');
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

await fs.mkdir(screenshots, { recursive: true });

const findings = [];
const stages = {};
const consoleErrors = [];
const pageErrors = [];

function recordFinding(stage, severity, summary, detail = null) {
  findings.push({ stage, severity, summary, detail });
}

async function stage(name, run) {
  const startedAt = Date.now();
  try {
    const detail = await run();
    stages[name] = {
      status: 'completed',
      milliseconds: Date.now() - startedAt,
      detail: detail ?? null,
    };
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

let wrangler = null;
let vite = null;
let browser = null;
let hostContext = null;
let guestContext = null;
let hostPage = null;
let guestPage = null;

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
    return { authorityOrigin: AUTHORITY_ORIGIN, frontendOrigin: FRONTEND_ORIGIN };
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
    return { executable: chromeExecutable ?? 'playwright-bundled' };
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
    return { lobbyShot, inventory };
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
    return {
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
    };
  });

  await stage('movement_probe', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const samples = [];
    const before = await snapshot(hostPage);
    const canvas = hostPage.locator('.online-session__canvas');
    await canvas.hover().catch(() => undefined);
    await hostPage.keyboard.down('KeyW');
    for (let index = 0; index < 8; index += 1) {
      await delay(220);
      const value = await snapshot(hostPage);
      samples.push({
        t: index * 220,
        position: value?.localAuthoritativePosition ?? null,
        speed: value?.localSpeedMillimetersPerSecond
          ?? value?.presentation?.localSpeedMillimetersPerSecond
          ?? null,
      });
    }
    await hostPage.keyboard.up('KeyW');
    await delay(350);
    // Jump probe.
    const groundedBefore = (await snapshot(hostPage))
      ?.localAuthoritativeGrounded ?? null;
    await hostPage.keyboard.press('Space');
    await delay(260);
    const midAir = await snapshot(hostPage);
    await delay(900);
    const landed = await snapshot(hostPage);
    // Strafe reversal probe.
    await hostPage.keyboard.down('KeyA');
    await delay(300);
    await hostPage.keyboard.up('KeyA');
    await hostPage.keyboard.down('KeyD');
    await delay(300);
    await hostPage.keyboard.up('KeyD');
    const after = await snapshot(hostPage);
    const moved = before?.localAuthoritativePosition && after?.localAuthoritativePosition
      ? Math.hypot(
          after.localAuthoritativePosition.x - before.localAuthoritativePosition.x,
          after.localAuthoritativePosition.z - before.localAuthoritativePosition.z,
        )
      : null;
    return {
      movedMillimeters: moved,
      samples,
      jump: {
        groundedBefore,
        airborneObserved: midAir?.localAuthoritativeGrounded === false,
        groundedAfter: landed?.localAuthoritativeGrounded ?? null,
      },
    };
  });

  await stage('weapon_roster_composition', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
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
    for (const entry of rail) {
      if (entry.disabled) continue;
      const slot = Number(entry.slot);
      await hostPage.keyboard.press(`Digit${slot + 1}`);
      await delay(950);
      const value = await snapshot(hostPage);
      const local = localPlayer(value);
      const hip = await shoot(
        hostPage,
        `02-weapon-slot${slot}-hip.png`,
      );
      // ADS probe for aim-enabled weapons.
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
      // Fire probe.
      await hostPage.keyboard.down('Enter');
      await delay(420);
      const fire = await shoot(
        hostPage,
        `02-weapon-slot${slot}-fire.png`,
      );
      await hostPage.keyboard.up('Enter');
      await delay(300);
      // Reload probe.
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
        visualSource: value?.render3d?.selectedWeaponVisualSource ?? null,
        contactMode: value?.render3d?.selectedFirstPersonContactMode ?? null,
        handCount: value?.render3d?.selectedFirstPersonHandCount ?? null,
        adsMix: adsValue?.render3d?.selectedFirstPersonAimMix ?? null,
        adsFov: adsValue?.render3d?.selectedFirstPersonFieldOfViewDegrees
          ?? null,
        shots: { hip, ads, fire, reload },
      });
    }
    // Return to slot 0.
    await hostPage.keyboard.press('Digit1');
    await delay(600);
    return { rail, perWeapon };
  });

  await stage('abilities', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const canvas = hostPage.locator('.online-session__canvas');
    await canvas.hover().catch(() => undefined);
    const result = {};
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
    // Second variant: pitch down toward the floor ahead, which is the
    // grounded-destination-friendly case, and record the reason again.
    await hostPage.keyboard.up('KeyQ');
    await delay(600);
    await tapLook(hostPage, 'ArrowDown', 6);
    await hostPage.keyboard.down('KeyQ');
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
    await tapLook(hostPage, 'ArrowUp', 6);
    const positionBefore = preview?.localAuthoritativePosition ?? null;
    await hostPage.keyboard.up('KeyQ');
    await delay(900);
    const afterBlink = await snapshot(hostPage);
    result.blinkCommit = {
      positionBefore,
      positionAfter: afterBlink?.localAuthoritativePosition ?? null,
    };
    result.blinkArrivalShot = await shoot(hostPage, '03b-blink-arrival.png');
    // Launch (E).
    await hostPage.keyboard.press('KeyE');
    await delay(500);
    result.launchShot = await shoot(hostPage, '03c-ability-launch.png');
    await delay(700);
    // Smoke (F): capture start and expansion.
    await hostPage.keyboard.press('KeyF');
    await delay(500);
    result.smokeStartShot = await shoot(hostPage, '03d-smoke-early.png');
    await delay(1_600);
    result.smokeFullShot = await shoot(hostPage, '03e-smoke-expanded.png');
    // Frag (Z): arc + detonation window.
    await hostPage.keyboard.press('KeyZ');
    await delay(450);
    result.fragFlightShot = await shoot(hostPage, '03f-frag-flight.png');
    await delay(1_500);
    result.fragAfterShot = await shoot(hostPage, '03g-frag-after.png');
    const abilityState = await snapshot(hostPage);
    result.abilityDiagnostics = {
      grenades: abilityState?.render3d?.grenadeProjectileCount ?? null,
      effects: abilityState?.render3d?.activeWeaponEffectCount ?? null,
    };
    return result;
  });

  await stage('combat_damage_kill_respawn', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const result = { engagements: [] };
    // Drive the host toward the guest, then fire until damage registers.
    const enemyPosition = (player) => player?.position
      ?? player?.feetPosition
      ?? player?.feetPositionMm
      ?? null;
    {
      const first = await snapshot(hostPage);
      result.remotePlayerKeys = Object.keys(remotePlayer(first) ?? {});
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const value = await snapshot(hostPage);
      const enemy = remotePlayer(value);
      const enemyAt = enemyPosition(enemy);
      const self = value?.localAuthoritativePosition;
      if (!enemyAt || !self) break;
      const distance = Math.hypot(
        enemyAt.x - self.x,
        enemyAt.z - self.z,
      );
      await rotateToYaw(
        hostPage,
        headingToMapTarget(self, enemyAt),
      );
      if (distance > 9_000) {
        await hostPage.keyboard.down('KeyW');
        await delay(Math.min(700, distance / 14));
        await hostPage.keyboard.up('KeyW');
        await delay(320);
        continue;
      }
      const healthBefore = enemy.health ?? null;
      await hostPage.keyboard.down('Enter');
      await delay(1_100);
      await hostPage.keyboard.up('Enter');
      await delay(450);
      const after = await snapshot(hostPage);
      const enemyAfter = remotePlayer(after);
      result.engagements.push({
        attempt,
        distanceMillimeters: Math.round(distance),
        enemyHealthBefore: healthBefore,
        enemyHealthAfter: enemyAfter?.health ?? null,
        enemyLifeState: enemyAfter?.lifeState ?? enemyAfter?.phase ?? null,
        hostScore: after?.combat?.snapshot?.match ?? null,
      });
      if ((enemyAfter?.health ?? 100) < (healthBefore ?? 100)) {
        result.damageShot = await shoot(hostPage, '04-damage-confirmed.png');
        result.guestDamageShot = await shoot(
          guestPage,
          '04b-guest-damage-received.png',
        );
      }
      if (
        (enemyAfter?.health ?? 100) <= 0
        || enemyAfter?.lifeState === 'dead'
        || enemyAfter?.alive === false
      ) {
        result.killShot = await shoot(hostPage, '04c-kill-confirmed.png');
        result.guestDeathShot = await shoot(guestPage, '04d-guest-death.png');
        await delay(3_800);
        result.guestRespawnShot = await shoot(
          guestPage,
          '04e-guest-respawn.png',
        );
        const respawned = await snapshot(guestPage);
        result.respawn = {
          guestPosition: respawned?.localAuthoritativePosition ?? null,
          guestHealth: localPlayer(respawned)?.health ?? null,
        };
        break;
      }
    }
    const final = await snapshot(hostPage);
    result.finalMatch = final?.combat?.snapshot?.match ?? null;
    return result;
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
    return { domScoreboard, shot, present: domScoreboard.length > 0 };
  });

  await stage('reconnect_resume', async () => {
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
    return {
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
  });

  await stage('performance_sample', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    await hostPage.evaluate(() => {
      const state = { frames: [], longTasks: [] };
      globalThis.__FABLE5_PERF__ = state;
      let previous = performance.now();
      const tick = (now) => {
        state.frames.push(now - previous);
        previous = now;
        if (state.frames.length < 900) requestAnimationFrame(tick);
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
    // Generate representative load: strafe + fire bursts.
    for (let index = 0; index < 4; index += 1) {
      await hostPage.keyboard.down(index % 2 === 0 ? 'KeyA' : 'KeyD');
      await hostPage.keyboard.down('Enter');
      await delay(900);
      await hostPage.keyboard.up('Enter');
      await hostPage.keyboard.up(index % 2 === 0 ? 'KeyA' : 'KeyD');
      await delay(250);
    }
    await delay(4_500);
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
        memory,
      };
    });
    return perf;
  });

  await stage('hud_viewport_matrix', async () => {
    if (!matchJoined) return { skipped: 'no active match' };
    const shots = {};
    await hostPage.setViewportSize({ width: 1_920, height: 1_080 });
    await delay(700);
    shots.fullHd = await shoot(hostPage, '07-hud-1920x1080.png', true);
    await hostPage.setViewportSize({ width: 1_024, height: 640 });
    await delay(700);
    shots.narrow = await shoot(hostPage, '07b-hud-1024x640.png', true);
    await hostPage.setViewportSize({ width: 2_560, height: 1_080 });
    await delay(700);
    shots.ultrawide = await shoot(hostPage, '07c-hud-2560x1080.png', true);
    await hostPage.setViewportSize({ width: 1_440, height: 900 });
    await delay(500);
    return shots;
  });

  await stage('practice_parity_probe', async () => {
    const practicePage = await hostContext.newPage();
    const result = {};
    try {
      await practicePage.goto(`${FRONTEND_ORIGIN}/`, {
        waitUntil: 'domcontentloaded',
      });
      await delay(1_200);
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
      const startPractice = practicePage.getByRole('button', {
        name: /start practice/iu,
      });
      if (await startPractice.count() > 0) {
        await startPractice.first().click();
        await delay(4_000);
        result.practiceShot = await shoot(
          practicePage,
          '08b-practice-entry.png',
          true,
        );
        const practiceHud = await practicePage.evaluate(() => ({
          weaponRailSlots: document
            .querySelectorAll('.online-session__weapon-slot').length,
          abilityRack: document.querySelector('#ability-rack') !== null,
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
        result.practiceNote = 'No Start practice button discovered.';
      }
    } finally {
      await practicePage.close().catch(() => undefined);
    }
    return result;
  });
} finally {
  const report = {
    harness: 'fable5-full-game-audit-v1',
    startedAtIso,
    finishedAtIso: new Date().toISOString(),
    repository: {
      head: repositoryHead,
      branch: repositoryBranch,
      statusShort: repositoryStatus === '' ? 'clean' : repositoryStatus,
    },
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
  process.stdout.write(`AUDIT_REPORT ${path.join(output, 'audit-report.json')}\n`);
  const failedStages = Object.entries(stages)
    .filter(([, value]) => value.status === 'failed')
    .map(([name]) => name);
  process.stdout.write(`AUDIT_STAGES_FAILED ${JSON.stringify(failedStages)}\n`);
}
