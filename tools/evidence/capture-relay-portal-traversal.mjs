import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option('--base-url', 'http://127.0.0.1:6342');
const outputRoot = path.resolve(option(
  '--output',
  'evidence/2026-08-08/relay-portal-player-input-v2',
));
const expectedFixtureHash = option('--fixture-hash', '95ec4f13a599892b');
const buildCommit = option('--commit', 'working-tree');

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const errors = { console: [], page: [], requests: [] };
const observations = [];
const movementSamples = [];
const captures = [];

page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.message));
page.on('requestfailed', (request) => {
  errors.requests.push({
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText ?? 'failed',
  });
});

async function snapshot(label) {
  const value = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
  if (value === null) throw new Error(`RELAY_PORTAL_SNAPSHOT_MISSING:${label}`);
  movementSamples.push({
    label,
    capturedAtMilliseconds: performance.now(),
    serverTick: value.serverTick,
    feetPosition: value.localAuthoritativePlayer.feetPosition,
    velocity: value.localAuthoritativePlayer.velocity,
    teleportCooldownTicksRemaining:
      value.localAuthoritativePlayer.teleportCooldownTicksRemaining,
    portalAuthorityCapabilityId: value.portalAuthorityCapabilityId,
    recentPortalTraversalEvents: value.recentPortalTraversalEvents,
    portalTraversalPresentationCount:
      value.render3d.portalTraversalPresentationCount,
    activePortalEffectCount: value.render3d.activePortalEffectCount,
  });
  return value;
}

async function capture(name, note) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({ name, note, url: page.url(), viewport: page.viewportSize() });
}

async function driveUntil({
  label,
  keys,
  predicate,
  maximumSegments,
  segmentMilliseconds = 300,
}) {
  for (const key of keys) await page.keyboard.down(key);
  let value = null;
  try {
    for (let segment = 0; segment < maximumSegments; segment += 1) {
      await page.waitForTimeout(segmentMilliseconds);
      value = await snapshot(`${label}.${String(segment + 1).padStart(2, '0')}`);
      if (predicate(value)) return value;
    }
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
    await page.waitForTimeout(120);
  }
  throw new Error(`RELAY_PORTAL_DRIVE_TIMEOUT:${label}:${JSON.stringify({
    feetPosition: value?.localAuthoritativePlayer?.feetPosition ?? null,
    traversalEvents: value?.recentPortalTraversalEvents ?? null,
  })}`);
}

async function centerOnWorldX() {
  let value = await snapshot('center_alignment.start');
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const position = value.localAuthoritativePlayer.feetPosition.x;
    const velocity = value.localAuthoritativePlayer.velocity.x;
    if (Math.abs(position) <= 650 && Math.abs(velocity) <= 1_000) return value;
    const key = position > 0 ? 's' : 'w';
    await page.keyboard.down(key);
    await page.waitForTimeout(90);
    await page.keyboard.up(key);
    await page.waitForTimeout(120);
    value = await snapshot(
      `center_alignment.${String(attempt + 1).padStart(2, '0')}`,
    );
  }
  throw new Error(`RELAY_PORTAL_CENTER_ALIGNMENT_TIMEOUT:${JSON.stringify({
    feetPosition: value.localAuthoritativePlayer.feetPosition,
    velocity: value.localAuthoritativePlayer.velocity,
  })}`);
}

async function centerUpperOnWorldX() {
  let value = await snapshot('upper_alignment.start');
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const position = value.localAuthoritativePlayer.feetPosition.x;
    const velocity = value.localAuthoritativePlayer.velocity.x;
    if (Math.abs(position) <= 650 && Math.abs(velocity) <= 1_000) return value;
    const key = position > 0 ? 'a' : 'd';
    await page.keyboard.down(key);
    await page.waitForTimeout(90);
    await page.keyboard.up(key);
    await page.waitForTimeout(120);
    value = await snapshot(
      `upper_alignment.${String(attempt + 1).padStart(2, '0')}`,
    );
  }
  throw new Error(`RELAY_PORTAL_UPPER_ALIGNMENT_TIMEOUT:${JSON.stringify({
    feetPosition: value.localAuthoritativePlayer.feetPosition,
    velocity: value.localAuthoritativePlayer.velocity,
  })}`);
}

async function waitForPortalCooldown() {
  let value = await snapshot('portal_cooldown.start');
  for (let sample = 0; sample < 48; sample += 1) {
    if (value.localAuthoritativePlayer.teleportCooldownTicksRemaining === 0) {
      return value;
    }
    await page.waitForTimeout(250);
    value = await snapshot(
      `portal_cooldown.${String(sample + 1).padStart(2, '0')}`,
    );
  }
  throw new Error(`RELAY_PORTAL_COOLDOWN_TIMEOUT:${JSON.stringify({
    feetPosition: value.localAuthoritativePlayer.feetPosition,
    cooldownTicks: value.localAuthoritativePlayer.teleportCooldownTicksRemaining,
  })}`);
}

let spawn = null;
let center = null;
let centerAligned = null;
let serviceApproach = null;
let upperArrival = null;
let cooldownComplete = null;
let upperAligned = null;
let upperApproach = null;
let lowerReturn = null;
const startedAtMilliseconds = performance.now();

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#play-btn').click();
  await page.waitForURL(/\/practice(?:\?|$)/u, { timeout: 20_000 });
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined, null, {
    timeout: 30_000,
  });
  await page.locator('.local-practice-gate__enter').click();
  await page.waitForFunction(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot().pointerLocked === true
  ), null, { timeout: 8_000 });

  spawn = await snapshot('spawn');
  observations.push({
    phase: 'notice_orient',
    expectation: 'W advances from the west spawn toward the central court.',
    actual: 'The local authority player begins at the west spawn with pointer lock.',
    evidence: '01-west-spawn.png',
  });
  await capture('01-west-spawn.png', 'West spawn before the player-input route.');

  center = await driveUntil({
    label: 'west_to_center',
    keys: ['Shift', 'w'],
    maximumSegments: 45,
    predicate: (value) => value.localAuthoritativePlayer.feetPosition.x >= -1_500,
  });
  observations.push({
    phase: 'act_read',
    expectation: 'The repaired connector-to-center seam remains grounded.',
    actual: `Reached x=${center.localAuthoritativePlayer.feetPosition.x}, y=${center.localAuthoritativePlayer.feetPosition.y} without recovery.`,
    evidence: '02-center-seam-crossed.png',
  });
  await capture(
    '02-center-seam-crossed.png',
    'Normal sprint input crossed the formerly open connector-to-center seam.',
  );

  centerAligned = await centerOnWorldX();
  observations.push({
    phase: 'orient_predict',
    expectation: 'The player can line up with the visible service gate before committing to the stair descent.',
    actual: `Aligned to x=${centerAligned.localAuthoritativePlayer.feetPosition.x} with x velocity=${centerAligned.localAuthoritativePlayer.velocity.x}.`,
    evidence: '02-center-seam-crossed.png',
  });

  serviceApproach = await driveUntil({
    label: 'center_to_service_approach',
    keys: ['Shift', 'd'],
    maximumSegments: 38,
    predicate: (value) => (
      value.localAuthoritativePlayer.feetPosition.z <= -18_600
      || value.recentPortalTraversalEvents > 0
    ),
  });
  if (serviceApproach.recentPortalTraversalEvents === 0) {
    await capture(
      '03-service-gate-approach.png',
      'Lower service court immediately before entering the cyan authority aperture.',
    );
  }

  upperArrival = serviceApproach.recentPortalTraversalEvents > 0
    ? serviceApproach
    : await driveUntil({
        label: 'service_gate_entry',
        keys: ['d'],
        maximumSegments: 12,
        segmentMilliseconds: 180,
        predicate: (value) => value.recentPortalTraversalEvents >= 1,
      });
  observations.push({
    phase: 'contact_confirmation',
    expectation: 'Crossing the service aperture moves the player to the upper overlook and emits one reliable traversal presentation.',
    actual: `Arrived at y=${upperArrival.localAuthoritativePlayer.feetPosition.y}, z=${upperArrival.localAuthoritativePlayer.feetPosition.z}; authority events=${upperArrival.recentPortalTraversalEvents}; presentation count=${upperArrival.render3d.portalTraversalPresentationCount}.`,
    evidence: '04-upper-overlook-arrival.png',
  });
  await capture(
    '04-upper-overlook-arrival.png',
    'First authority-confirmed portal arrival on the upper overlook.',
  );

  cooldownComplete = await waitForPortalCooldown();
  upperAligned = await centerUpperOnWorldX();
  upperApproach = await driveUntil({
    label: 'upper_exit_to_return_approach',
    keys: ['Shift', 'w'],
    maximumSegments: 10,
    segmentMilliseconds: 220,
    predicate: (value) => (
      value.localAuthoritativePlayer.feetPosition.z >= 19_500
      || value.recentPortalTraversalEvents >= 2
    ),
  });
  if (upperApproach.recentPortalTraversalEvents < 2) {
    await capture(
      '05-overlook-gate-approach.png',
      'Upper overlook immediately before the amber return aperture.',
    );
  }

  lowerReturn = upperApproach.recentPortalTraversalEvents >= 2
    ? upperApproach
    : await driveUntil({
        label: 'overlook_gate_entry',
        keys: ['w'],
        maximumSegments: 12,
        segmentMilliseconds: 180,
        predicate: (value) => value.recentPortalTraversalEvents >= 2,
      });
  observations.push({
    phase: 'transfer_recovery',
    expectation: 'The learned portal rule transfers to the partner aperture and returns to the lower court after cooldown.',
    actual: `Returned at y=${lowerReturn.localAuthoritativePlayer.feetPosition.y}, z=${lowerReturn.localAuthoritativePlayer.feetPosition.z}; authority events=${lowerReturn.recentPortalTraversalEvents}.`,
    evidence: '06-lower-service-return.png',
  });
  await capture(
    '06-lower-service-return.png',
    'Second authority-confirmed traversal returned the player to the lower service court.',
  );
} finally {
  const completedAtMilliseconds = performance.now();
  await writeFile(
    path.join(outputRoot, 'runtime.json'),
    `${JSON.stringify({
      schema: 'kyx-relay-portal-player-input-evidence-v1',
      capturedAt: new Date().toISOString(),
      buildCommit,
      buildMode: 'staging-review',
      baseUrl,
      expectedFixtureHash,
      viewport: { width: 1440, height: 900 },
      inputDevice: 'automated_keyboard_mouse_equivalent',
      route: 'west_spawn_to_center_to_service_gate_to_overlook_gate_to_service_return',
      elapsedMilliseconds: completedAtMilliseconds - startedAtMilliseconds,
      spawn,
      center,
      centerAligned,
      serviceApproach,
      upperArrival,
      cooldownComplete,
      upperAligned,
      upperApproach,
      lowerReturn,
      observations,
      movementSamples,
      captures,
      errors,
      labels: {
        functionalCorrectness: 'MEASURED',
        playerEyePresentation: 'OBSERVED',
        routeInterpretation: 'INFERRED',
        humanAcceptance: 'UNKNOWN',
      },
      nonclaims: [
        'Keyboard automation is not literal human play or final human acceptance.',
        'This local 1+7 route does not prove online Worker Relay authority or reconnect behavior.',
        'This route proves the paired portal loop once; it is not a balance, spawn-safety, or repeated-use stress claim.',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
}

if (errors.console.length || errors.page.length || errors.requests.length) {
  throw new Error(`RELAY_PORTAL_RUNTIME_ERRORS:${JSON.stringify(errors)}`);
}
if (spawn?.fixtureHash !== expectedFixtureHash) {
  throw new Error(`RELAY_PORTAL_FIXTURE_HASH_MISMATCH:${spawn?.fixtureHash}`);
}
if (spawn?.portalAuthorityCapabilityId !== 'relay_revision_1_linked_world_portal_v1') {
  throw new Error('RELAY_PORTAL_AUTHORITY_CAPABILITY_MISMATCH');
}
if (spawn?.render3d?.staticWorldPortalCount !== 2) {
  throw new Error('RELAY_PORTAL_STATIC_APERTURE_MISMATCH');
}
if (center?.localAuthoritativePlayer?.feetPosition.y < 0) {
  throw new Error('RELAY_PORTAL_CENTER_ROUTE_NOT_GROUNDED');
}
if (
  upperArrival?.recentPortalTraversalEvents < 1
  || upperArrival?.render3d?.portalTraversalPresentationCount < 1
  || upperArrival?.localAuthoritativePlayer?.feetPosition.y < 3_500
) {
  throw new Error('RELAY_PORTAL_SERVICE_TO_OVERLOOK_NOT_PROVEN');
}
if (
  lowerReturn?.recentPortalTraversalEvents < 2
  || lowerReturn?.render3d?.portalTraversalPresentationCount < 2
  || lowerReturn?.localAuthoritativePlayer?.feetPosition.y > -2_500
) {
  throw new Error('RELAY_PORTAL_OVERLOOK_TO_SERVICE_NOT_PROVEN');
}

process.stdout.write(`${JSON.stringify({
  status: 'RELAY_PORTAL_PLAYER_INPUT_LOOP_VERIFIED',
  outputRoot,
  fixtureHash: spawn.fixtureHash,
  portalAuthorityCapabilityId: spawn.portalAuthorityCapabilityId,
  centerRouteFeetPosition: center.localAuthoritativePlayer.feetPosition,
  firstArrivalFeetPosition: upperArrival.localAuthoritativePlayer.feetPosition,
  returnFeetPosition: lowerReturn.localAuthoritativePlayer.feetPosition,
  traversalEventCount: lowerReturn.recentPortalTraversalEvents,
  traversalPresentationCount:
    lowerReturn.render3d.portalTraversalPresentationCount,
  runtimeErrorCount: 0,
}, null, 2)}\n`);
