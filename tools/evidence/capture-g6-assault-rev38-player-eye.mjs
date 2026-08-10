import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option('--base-url', 'http://127.0.0.1:6338');
const candidateRevision = option('--candidate', 'rev39-armored-restore-v1');
const outputRoot = path.resolve(option(
  '--output',
  `evidence/2026-08-09/${candidateRevision}-player-eye-v1`,
));
const buildCommit = option('--commit', 'working-tree');

function candidateUrl(pathname = '/') {
  const url = new URL(pathname, `${baseUrl.replace(/\/$/u, '')}/`);
  url.searchParams.set('g6Candidate', candidateRevision);
  return url.href;
}

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const errors = {
  console: [],
  page: [],
  requests: [],
  ignoredSameOriginModuleAborts: [],
};
const glbResponses = [];
const captures = [];

page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.message));
page.on('requestfailed', (request) => {
  const failure = {
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText ?? 'failed',
  };
  const failedUrl = new URL(failure.url);
  const reviewOrigin = new URL(baseUrl).origin;
  if (
    failure.method === 'GET'
    && failure.error === 'net::ERR_ABORTED'
    && failedUrl.origin === reviewOrigin
    && failedUrl.pathname.startsWith('/src/')
  ) {
    // Entering the arena intentionally replaces the menu document. Chromium
    // cancels any same-origin Vite module requests still in flight from that
    // document; preserve them as navigation telemetry, not runtime failures.
    errors.ignoredSameOriginModuleAborts.push(failure);
    return;
  }
  errors.requests.push(failure);
});
page.on('response', (response) => {
  if (!new URL(response.url()).pathname.toLowerCase().endsWith('.glb')) return;
  glbResponses.push({ url: response.url(), status: response.status() });
});

async function capture(name, notes) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({ name, url: page.url(), viewport: page.viewportSize(), notes });
}

let candidateSnapshot = null;
let loadoutCrouchSnapshot = null;
let loadoutStrafeSnapshot = null;
let loadoutBackpedalSnapshot = null;
const loadoutStrafeSamples = [];
const loadoutBackpedalSamples = [];
let crouchCandidateSnapshot = null;
let practiceBefore = null;
let practiceAfter = null;
let pointerLockAcquired = false;

try {
  await page.goto(candidateUrl('/'), { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 20_000 });
  await capture(
    '01-menu-first-impression-1440x900.png',
    'First 3/10/30-second menu surface in the source-matched staging-review build.',
  );

  await page.getByRole('button', { name: 'Arenas' }).click();
  await page.locator('#panel-maps').waitFor({ state: 'visible' });
  await capture(
    '02-arena-selection-original-1440x900.png',
    'Original-arena lane before any legacy tab interaction.',
  );
  await page.getByRole('tab', { name: /Legacy maps/i }).click();
  await capture(
    '03-arena-selection-legacy-1440x900.png',
    'Legacy lane showing playable KYX history and the local-only evmap rights boundary.',
  );
  await page.getByRole('button', { name: 'Close map library' }).click();

  await page.getByRole('button', { name: 'Loadout' }).click();
  await page.locator('#panel-loadout').waitFor({ state: 'visible' });
  await page.waitForFunction((expectedRevision) => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.revision === expectedRevision
    && window.__KYX_G6_CHARACTER_EVIDENCE__.snapshot().instances.length > 0
  ), candidateRevision, { timeout: 30_000 });
  // The turntable rotates continuously; this short settle preserves a useful
  // front-three-quarter review angle instead of waiting into a side profile.
  await page.waitForTimeout(250);
  candidateSnapshot = await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
  ));
  await capture(
    '04-loadout-armored-turntable-1440x900.png',
    'Actual runtime loadout turntable using the installed armored staging-review candidate.',
  );
  await page.locator('#armor-preview-canvas').screenshot({
    path: path.join(outputRoot, '05-armored-turntable-canvas.png'),
  });
  captures.push({
    name: '05-armored-turntable-canvas.png',
    url: page.url(),
    viewport: page.viewportSize(),
    notes: 'Unscaled runtime canvas crop; not a static Blender render.',
  });
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setStanceOverride?.('crouched')
  ));
  await page.waitForFunction(() => {
    const instances = window.__KYX_G6_CHARACTER_EVIDENCE__
      ?.snapshot().instances
      .filter((instance) => instance.connectedToScene && instance.visible) ?? [];
    return instances.length > 0 && instances.every(
      (instance) => (instance.presentation?.crouchMix ?? 0) > 0.65,
    );
  }, null, { timeout: 5_000 });
  loadoutCrouchSnapshot = await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
  ));
  await page.locator('#armor-preview-canvas').screenshot({
    path: path.join(outputRoot, '05b-armored-turntable-crouch-canvas.png'),
  });
  captures.push({
    name: '05b-armored-turntable-crouch-canvas.png',
    url: page.url(),
    viewport: page.viewportSize(),
    notes: 'Evidence-only skeletal-crouch close-up from the same live turntable.',
  });
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setStanceOverride?.(null)
  ));
  await page.waitForTimeout(350);
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setLocomotionOverride?.('right')
  ));
  await page.waitForFunction(() => {
    const instances = window.__KYX_G6_CHARACTER_EVIDENCE__
      ?.snapshot().instances
      .filter((instance) => instance.connectedToScene && instance.visible) ?? [];
    return instances.length > 0 && instances.every((instance) => (
      instance.presentation?.locomotion?.sector === 'right'
      && instance.presentation?.activeClipKey === 'run'
      && (instance.presentation?.gaitPlaybackRate ?? 0) > 0
      && (instance.presentation?.cadenceSpeedError ?? Infinity) < 0.05
    ));
  }, null, { timeout: 5_000 });
  for (let frame = 1; frame <= 4; frame += 1) {
    await page.waitForTimeout(160);
    const snapshot = await page.evaluate(() => (
      window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
    ));
    loadoutStrafeSamples.push(snapshot);
    const name = `05c-${frame}-armored-turntable-strafe-right-canvas.png`;
    await page.locator('#armor-preview-canvas').screenshot({
      path: path.join(outputRoot, name),
    });
    captures.push({
      name,
      url: page.url(),
      viewport: page.viewportSize(),
      notes: `Right-strafe gait sequence frame ${frame}/4 using measured direction.`,
    });
  }
  loadoutStrafeSnapshot = loadoutStrafeSamples.at(-1) ?? null;
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setLocomotionOverride?.('backward')
  ));
  await page.waitForFunction(() => {
    const instances = window.__KYX_G6_CHARACTER_EVIDENCE__
      ?.snapshot().instances
      .filter((instance) => instance.connectedToScene && instance.visible) ?? [];
    return instances.length > 0 && instances.every((instance) => (
      instance.presentation?.locomotion?.sector === 'backward'
      && instance.presentation?.activeClipKey === 'walk'
      && (instance.presentation?.gaitPlaybackRate ?? 0) < 0
      && (instance.presentation?.cadenceSpeedError ?? Infinity) < 0.05
    ));
  }, null, { timeout: 5_000 });
  for (let frame = 1; frame <= 4; frame += 1) {
    await page.waitForTimeout(210);
    const snapshot = await page.evaluate(() => (
      window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
    ));
    loadoutBackpedalSamples.push(snapshot);
    const name = `05d-${frame}-armored-turntable-backpedal-canvas.png`;
    await page.locator('#armor-preview-canvas').screenshot({
      path: path.join(outputRoot, name),
    });
    captures.push({
      name,
      url: page.url(),
      viewport: page.viewportSize(),
      notes: `Reverse-backpedal gait sequence frame ${frame}/4.`,
    });
  }
  loadoutBackpedalSnapshot = loadoutBackpedalSamples.at(-1) ?? null;
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setLocomotionOverride?.(null)
  ));
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Close loadout' }).click();

  await page.locator('#play-btn').click();
  await page.waitForURL(/\/practice(?:\?|$)/u, { timeout: 20_000 });
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined, null, {
    timeout: 30_000,
  });
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('.local-practice-gate__enter').waitFor({ state: 'visible' });
  practiceBefore = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
  await capture(
    '06-inkfall-practice-paused-1440x900.png',
    'Player-eye Inkfall view before pointer capture; HUD and entry affordance visible.',
  );

  await page.locator('.local-practice-gate__enter').click();
  try {
    await page.waitForFunction(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().pointerLocked === true
    ), null, { timeout: 5_000 });
    pointerLockAcquired = true;
  } catch {
    pointerLockAcquired = false;
  }

  if (pointerLockAcquired) {
    await page.waitForTimeout(650);
    await capture(
      '07-inkfall-remote-assault-contact-1440x900.png',
      'Unsteered player-eye frame preserving the spawn sightline toward remote Assault candidates.',
    );
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(180);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(250);
    await capture(
      '08-inkfall-after-primary-fire-1440x900.png',
      'Same stable spawn sightline after primary fire, without a scripted camera collision.',
    );
    await page.evaluate(() => (
      window.__KYX_G6_CHARACTER_EVIDENCE__?.setStanceOverride?.('crouched')
    ));
    await page.waitForFunction(() => {
      const instances = window.__KYX_G6_CHARACTER_EVIDENCE__
        ?.snapshot().instances
        .filter((instance) => (
          instance.runtimeRole === 'online_remote'
          && instance.connectedToScene
        )) ?? [];
      return instances.length > 0 && instances.every(
        (instance) => (instance.presentation?.crouchMix ?? 0) > 0.65,
      );
    }, null, { timeout: 5_000 });
    crouchCandidateSnapshot = await page.evaluate(() => (
      window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
    ));
    await capture(
      '09-inkfall-remote-assault-crouch-1440x900.png',
      'Evidence-only staging override proving a skeletal crouch and preserved character proportions.',
    );
    await page.evaluate(() => (
      window.__KYX_G6_CHARACTER_EVIDENCE__?.setStanceOverride?.(null)
    ));
    await page.waitForTimeout(350);
    await page.keyboard.down('Tab');
    await page.waitForTimeout(250);
    await capture(
      '10-inkfall-scoreboard-held-1440x900.png',
      'Live hold-Tab scoreboard over the current player-eye frame.',
    );
    await page.keyboard.up('Tab');
  }

  practiceAfter = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
} finally {
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setStanceOverride?.(null)
  )).catch(() => undefined);
  await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.setLocomotionOverride?.(null)
  )).catch(() => undefined);
  await writeFile(
    path.join(outputRoot, 'runtime.json'),
    `${JSON.stringify({
      schema: 'kyx-g6-assault-player-eye-capture-v5',
      capturedAt: new Date().toISOString(),
      buildCommit,
      candidateRevision,
      buildMode: 'staging-review',
      baseUrl,
      viewport: { width: 1440, height: 900 },
      candidateSnapshot,
      loadoutCrouchSnapshot,
      loadoutStrafeSnapshot,
      loadoutBackpedalSnapshot,
      loadoutStrafeSamples,
      loadoutBackpedalSamples,
      crouchCandidateSnapshot,
      practiceBefore,
      practiceAfter,
      pointerLockAcquired,
      glbResponses,
      captures,
      errors,
      nonclaims: [
        'No human visual acceptance is claimed.',
        `Candidate ${candidateRevision} remains review-only and release-ineligible.`,
        'This bounded run is not 2/4/8 multiplayer proof or a performance soak.',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
}

if (errors.console.length || errors.page.length || errors.requests.length) {
  throw new Error(`G6_ASSAULT_RUNTIME_ERRORS ${JSON.stringify(errors)}`);
}
if (candidateSnapshot?.revision !== candidateRevision) {
  throw new Error('G6_ASSAULT_RUNTIME_IDENTITY_MISMATCH');
}
const loadoutCrouchCandidates = loadoutCrouchSnapshot?.instances?.filter(
  (instance) => instance.connectedToScene && instance.visible,
) ?? [];
if (
  loadoutCrouchCandidates.length < 1
  || loadoutCrouchCandidates.some(
    (instance) => (instance.presentation?.crouchMix ?? 0) <= 0.65,
  )
) {
  throw new Error('G6_ASSAULT_LOADOUT_CROUCH_PROOF_INVALID');
}
const loadoutStrafeCandidates = loadoutStrafeSnapshot?.instances?.filter(
  (instance) => instance.connectedToScene && instance.visible,
) ?? [];
if (
  loadoutStrafeCandidates.length < 1
  || loadoutStrafeCandidates.some((instance) => (
    instance.presentation?.locomotion?.sector !== 'right'
    || instance.presentation?.activeClipKey !== 'run'
    || (instance.presentation?.gaitPlaybackRate ?? 0) <= 0
    || (instance.presentation?.cadenceSpeedError ?? Infinity) >= 0.05
  ))
) {
  throw new Error('G6_ASSAULT_LOADOUT_STRAFE_PROOF_INVALID');
}
const loadoutBackpedalCandidates = loadoutBackpedalSnapshot?.instances?.filter(
  (instance) => instance.connectedToScene && instance.visible,
) ?? [];
if (
  loadoutBackpedalCandidates.length < 1
  || loadoutBackpedalCandidates.some((instance) => (
    instance.presentation?.locomotion?.sector !== 'backward'
    || instance.presentation?.activeClipKey !== 'walk'
    || (instance.presentation?.gaitPlaybackRate ?? 0) >= 0
    || (instance.presentation?.cadenceSpeedError ?? Infinity) >= 0.05
  ))
) {
  throw new Error('G6_ASSAULT_LOADOUT_BACKPEDAL_PROOF_INVALID');
}
if (practiceBefore?.render3d?.selectedFirstPersonOverlapFree !== true) {
  throw new Error('G6_ASSAULT_FIRST_PERSON_WEAPON_OVERLAP');
}
const remoteAvatarCount = practiceAfter?.render3d?.remoteAvatarCount ?? 0;
if (remoteAvatarCount < 1) {
  throw new Error('G6_ASSAULT_REMOTE_AVATARS_MISSING');
}
if (practiceAfter?.render3d?.remoteAvatarCandidateCount !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_REMOTE_CANDIDATE_BINDING_MISMATCH');
}
if (practiceAfter?.render3d?.remoteAvatarAuthoredClipCount !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_REMOTE_AUTHORED_CLIP_MISMATCH');
}
if (practiceAfter?.render3d?.remoteAvatarWeaponAttachmentCount !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_REMOTE_WEAPON_ATTACHMENT_MISMATCH');
}
if (practiceAfter?.render3d?.remoteAvatarSupportHandContactCount !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_REMOTE_SUPPORT_HAND_CONTACT_MISMATCH');
}
if (
  practiceAfter?.render3d?.remoteAvatarQualifiedSupportHandContactCount
    !== remoteAvatarCount
  || (practiceAfter?.render3d?.remoteAvatarMaximumSupportHandErrorMeters ?? Infinity)
    > 0.12
) {
  throw new Error('G6_ASSAULT_REMOTE_SUPPORT_HAND_CONTACT_NOT_QUALIFIED');
}
if (practiceAfter?.render3d?.remoteAvatarSkeletalStanceContractCount !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_REMOTE_SKELETAL_STANCE_CONTRACT_MISMATCH');
}
if (practiceAfter?.render3d?.remoteAvatarWholeBodySquashCount !== 0) {
  throw new Error('G6_ASSAULT_REMOTE_WHOLE_BODY_SQUASH_PRESENT');
}
const crouchCandidates = crouchCandidateSnapshot?.instances?.filter(
  (instance) => instance.runtimeRole === 'online_remote' && instance.connectedToScene,
) ?? [];
if (crouchCandidates.length !== remoteAvatarCount) {
  throw new Error('G6_ASSAULT_CROUCH_PROOF_CARDINALITY_MISMATCH');
}
if (crouchCandidates.some((instance) => (
  (instance.presentation?.crouchMix ?? 0) <= 0.65
  || (instance.presentation?.stanceOffsetY ?? 0) >= 0
))) {
  throw new Error('G6_ASSAULT_CROUCH_PROOF_INVALID');
}

process.stdout.write(`${JSON.stringify({
  status: 'G6_ASSAULT_PLAYER_EYE_PACKET_CAPTURED',
  candidateRevision,
  outputRoot,
  pointerLockAcquired,
  candidateInstances: candidateSnapshot?.instances?.length ?? 0,
  loadoutCrouchProofCount: loadoutCrouchCandidates.length,
  loadoutStrafeProofCount: loadoutStrafeCandidates.length,
  loadoutBackpedalProofCount: loadoutBackpedalCandidates.length,
  remoteAvatarCount,
  remoteAvatarCandidateCount:
    practiceAfter?.render3d?.remoteAvatarCandidateCount ?? null,
  remoteAvatarAnimationContractCount:
    practiceAfter?.render3d?.remoteAvatarAnimationContractCount ?? null,
  remoteAvatarAuthoredClipCount:
    practiceAfter?.render3d?.remoteAvatarAuthoredClipCount ?? null,
  remoteAvatarWeaponAttachmentCount:
    practiceAfter?.render3d?.remoteAvatarWeaponAttachmentCount ?? null,
  remoteAvatarSupportHandContactCount:
    practiceAfter?.render3d?.remoteAvatarSupportHandContactCount ?? null,
  remoteAvatarQualifiedSupportHandContactCount:
    practiceAfter?.render3d?.remoteAvatarQualifiedSupportHandContactCount ?? null,
  remoteAvatarMaximumSupportHandErrorMeters:
    practiceAfter?.render3d?.remoteAvatarMaximumSupportHandErrorMeters ?? null,
  remoteAvatarSkeletalStanceContractCount:
    practiceAfter?.render3d?.remoteAvatarSkeletalStanceContractCount ?? null,
  remoteAvatarWholeBodySquashCount:
    practiceAfter?.render3d?.remoteAvatarWholeBodySquashCount ?? null,
  crouchProofCount: crouchCandidates.length,
  firstPersonOverlapFree:
    practiceAfter?.render3d?.selectedFirstPersonOverlapFree ?? null,
  runtimeErrorCount:
    errors.console.length + errors.page.length + errors.requests.length,
}, null, 2)}\n`);
