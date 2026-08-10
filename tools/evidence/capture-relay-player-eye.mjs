import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

import {
  captureOrientationResidual,
  captureOrientationWithinTolerance,
  RELAY_CAPTURE_FRAME,
} from './relay-player-eye-orientation-contract.mjs';
import {
  createRouteProgressWatchdog,
  horizontalTargetDelta,
  observeRouteProgress,
} from './relay-player-eye-route-watchdog.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option('--base-url', 'http://127.0.0.1:6338');
const capturePacketIdentity = 'canonical-combat-presentation-integration-v6';
const capturePacketSchema = 'kyx-relay-visual-candidate-player-eye-v11';
const v6EvidenceRoot = path.resolve(
  `evidence/2026-08-10/${capturePacketIdentity}`,
);
const outputRoot = path.resolve(option(
  '--output',
  `evidence/2026-08-10/${capturePacketIdentity}/runtime`,
));
const buildCommit = option('--commit', 'working-tree');
const expectedPresentationReference = 'relay@1/open-sky/v5';
const expectedAuthorityFixtureHash = '95ec4f13a599892b';
const maximumBasePresentationMeshCount = 96;
const protectedEvidenceRoots = Object.freeze([
  path.resolve('evidence/2026-08-09/canonical-combat-presentation-integration-v1'),
  path.resolve('evidence/2026-08-09/canonical-combat-presentation-integration-v2'),
  path.resolve('evidence/2026-08-09/canonical-combat-presentation-integration-v3'),
  path.resolve('evidence/2026-08-10/canonical-combat-presentation-integration-v4'),
  path.resolve('evidence/2026-08-10/canonical-combat-presentation-integration-v5'),
]);
const provenMainFloorRegions = Object.freeze([
  Object.freeze({
    id: 'relay_spawn_pad_west',
    minimumX: -33_000,
    maximumX: -23_000,
    minimumZ: -7_000,
    maximumZ: 7_000,
  }),
  Object.freeze({
    id: 'relay_floor_west_connector',
    minimumX: -23_000,
    maximumX: -13_000,
    minimumZ: -4_000,
    maximumZ: 4_000,
  }),
  Object.freeze({
    id: 'relay_floor_central_court',
    minimumX: -13_000,
    maximumX: 13_000,
    minimumZ: -8_500,
    maximumZ: 10_000,
  }),
]);
const routeOneCaptureBounds = Object.freeze({
  id: 'relay_floor_west_connector_capture',
  minimumX: -19_500,
  maximumX: -16_500,
  minimumZ: -3_000,
  maximumZ: 3_000,
});
const routeTwoCaptureBounds = Object.freeze({
  id: 'relay_floor_central_court_capture',
  minimumX: -11_500,
  maximumX: -8_500,
  minimumZ: -3_000,
  maximumZ: 3_000,
});
const movementContactBounds = Object.freeze({
  ...provenMainFloorRegions[2],
  id: 'relay_floor_central_court_movement_contact',
});
const settledFloorMinimumY = -100;
const settledFloorMaximumY = 250;
const settledMaximumVerticalSpeed = 250;
const maximumCaptureLookErrorMilliDegrees = 750;
const mouseMilliDegreesPerPixel = 110;
const maximumCameraCorrectionPixelsPerStep = 240;
const routeAuthorityTickMilliseconds = 50;
const routeMaximumStalledTicks = 12;
const routeMinimumProgressMillimeters = 100;

function containsPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

for (const protectedRoot of protectedEvidenceRoots) {
  if (containsPath(protectedRoot, outputRoot)) {
    throw new Error(`RELAY_PROTECTED_EVIDENCE_ROOT actual=${outputRoot}`);
  }
}
if (!containsPath(v6EvidenceRoot, outputRoot)) {
  throw new Error(`RELAY_V6_OUTPUT_ROOT_REQUIRED actual=${outputRoot}`);
}

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const errors = { console: [], page: [], requests: [] };
const glbResponses = [];
const captures = [];
const movementSnapshots = [];
const routeMovementSamples = [];
const routeMovementReports = [];
const routeFloorAssertions = [];
const cameraAlignmentSamples = [];
let captureFailure = null;
let captureMousePosition = null;

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
page.on('response', (response) => {
  if (!new URL(response.url()).pathname.toLowerCase().endsWith('.glb')) return;
  glbResponses.push({ url: response.url(), status: response.status() });
});

async function capture(name, notes, proveFrame = null, settleMilliseconds = 300) {
  await page.waitForTimeout(settleMilliseconds);
  if (proveFrame !== null) await proveFrame();
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({ name, url: page.url(), viewport: page.viewportSize(), notes });
}

async function practiceSnapshot(label) {
  const snapshot = await readPracticeSnapshot();
  movementSnapshots.push({ label, snapshot });
  return snapshot;
}

async function readPracticeSnapshot() {
  return page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
}

function finitePosition(snapshot, label) {
  const feet = snapshot?.localAuthoritativePlayer?.feetPosition;
  const velocity = snapshot?.localAuthoritativePlayer?.velocity;
  const yawMilliDegrees = snapshot?.localAuthoritativePlayer?.yawMilliDegrees;
  const pitchMilliDegrees = snapshot?.localAuthoritativePlayer?.pitchMilliDegrees;
  if (
    feet === null
    || feet === undefined
    || velocity === null
    || velocity === undefined
    || ![
      feet.x,
      feet.y,
      feet.z,
      velocity.x,
      velocity.y,
      velocity.z,
      yawMilliDegrees,
      pitchMilliDegrees,
    ]
      .every(Number.isFinite)
  ) {
    throw new Error(`RELAY_ROUTE_POSITION_UNAVAILABLE label=${label}`);
  }
  return { feet, velocity, yawMilliDegrees, pitchMilliDegrees };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function insideHorizontalBounds(feet, bounds) {
  return feet.x >= bounds.minimumX
    && feet.x <= bounds.maximumX
    && feet.z >= bounds.minimumZ
    && feet.z <= bounds.maximumZ;
}

function assertOverProvenMainFloor(snapshot, label, maximumFeetY = settledFloorMaximumY) {
  if (snapshot?.fixtureHash !== expectedAuthorityFixtureHash) {
    throw new Error(
      `RELAY_ROUTE_FIXTURE_HASH_MISMATCH label=${label}`
      + ` actual=${snapshot?.fixtureHash}`
      + ` expected=${expectedAuthorityFixtureHash}`,
    );
  }
  const {
    feet,
    velocity,
    yawMilliDegrees,
    pitchMilliDegrees,
  } = finitePosition(snapshot, label);
  const region = provenMainFloorRegions.find((candidate) => (
    insideHorizontalBounds(feet, candidate)
  ));
  if (
    region === undefined
    || feet.y < settledFloorMinimumY
    || feet.y > maximumFeetY
  ) {
    throw new Error(
      `RELAY_ROUTE_LEFT_PROVEN_MAIN_FLOOR label=${label}`
      + ` feet=${JSON.stringify(feet)}`,
    );
  }
  return {
    feet,
    velocity,
    yawMilliDegrees,
    pitchMilliDegrees,
    region,
  };
}

function assertCapturedOnFloor(snapshot, label, requiredBounds) {
  const proof = assertOverProvenMainFloor(snapshot, label);
  if (snapshot?.match?.localLifePhase !== 'alive') {
    throw new Error(
      `RELAY_CAPTURE_LOCAL_PLAYER_NOT_ALIVE label=${label}`
      + ` phase=${snapshot?.match?.localLifePhase}`,
    );
  }
  if (!insideHorizontalBounds(proof.feet, requiredBounds)) {
    throw new Error(
      `RELAY_ROUTE_CAPTURE_BOUNDS_MISMATCH label=${label}`
      + ` expected=${requiredBounds.id}`
      + ` feet=${JSON.stringify(proof.feet)}`,
    );
  }
  if (Math.abs(proof.velocity.y) > settledMaximumVerticalSpeed) {
    throw new Error(
      `RELAY_ROUTE_CAPTURE_NOT_SETTLED label=${label}`
      + ` verticalSpeed=${proof.velocity.y}`,
    );
  }
  const residual = captureOrientationResidual(
    proof.yawMilliDegrees,
    proof.pitchMilliDegrees,
  );
  if (!captureOrientationWithinTolerance(
    residual,
    maximumCaptureLookErrorMilliDegrees,
  )) {
    throw new Error(
      `RELAY_CAPTURE_LOOK_OUTSIDE_ROUTE_FRAME label=${label}`
      + ` actualYaw=${proof.yawMilliDegrees}`
      + ` actualPitch=${proof.pitchMilliDegrees}`
      + ` targetYaw=${RELAY_CAPTURE_FRAME.yawMilliDegrees}`
      + ` targetPitch=${RELAY_CAPTURE_FRAME.pitchMilliDegrees}`
      + ` yawResidual=${residual.yawMilliDegrees}`
      + ` pitchResidual=${residual.pitchMilliDegrees}`,
    );
  }
  routeFloorAssertions.push(Object.freeze({
    label,
    authorityFloorRegion: proof.region.id,
    requiredCaptureBounds: requiredBounds.id,
    feetPosition: Object.freeze({ ...proof.feet }),
    velocity: Object.freeze({ ...proof.velocity }),
    yawMilliDegrees: proof.yawMilliDegrees,
    pitchMilliDegrees: proof.pitchMilliDegrees,
    targetYawMilliDegrees: RELAY_CAPTURE_FRAME.yawMilliDegrees,
    targetPitchMilliDegrees: RELAY_CAPTURE_FRAME.pitchMilliDegrees,
    yawResidualMilliDegrees: residual.yawMilliDegrees,
    pitchResidualMilliDegrees: residual.pitchMilliDegrees,
    maximumOrientationResidualMilliDegrees: maximumCaptureLookErrorMilliDegrees,
    serverTick: snapshot.serverTick,
    status: 'PASS',
  }));
  return snapshot;
}

function recordRouteMovementSample(
  snapshot,
  segment,
  phase,
  requiredBounds,
  sampleOrdinal,
) {
  const proof = finitePosition(snapshot, `${segment}:${phase}`);
  const authorityFloorRegion = provenMainFloorRegions.find((candidate) => (
    insideHorizontalBounds(proof.feet, candidate)
  ))?.id ?? null;
  const targetDelta = horizontalTargetDelta(proof.feet, requiredBounds);
  const orientationResidual = captureOrientationResidual(
    proof.yawMilliDegrees,
    proof.pitchMilliDegrees,
  );
  const sample = Object.freeze({
    sequence: routeMovementSamples.length,
    segment,
    phase,
    sampleOrdinal,
    serverTick: snapshot?.serverTick ?? null,
    fixtureHash: snapshot?.fixtureHash ?? null,
    authorityFloorRegion,
    targetBounds: requiredBounds.id,
    targetDelta,
    feetPosition: Object.freeze({ ...proof.feet }),
    velocity: Object.freeze({ ...proof.velocity }),
    yawMilliDegrees: proof.yawMilliDegrees,
    pitchMilliDegrees: proof.pitchMilliDegrees,
    yawResidualMilliDegrees: orientationResidual.yawMilliDegrees,
    pitchResidualMilliDegrees: orientationResidual.pitchMilliDegrees,
    localLifePhase: snapshot?.match?.localLifePhase ?? null,
    pointerLocked: snapshot?.pointerLocked ?? null,
  });
  routeMovementSamples.push(sample);
  return Object.freeze({
    proof,
    targetDelta,
    orientationResidual,
    sample,
  });
}

function assertRouteMovementSample(
  snapshot,
  observation,
  maximumFeetY = settledFloorMaximumY,
) {
  assertOverProvenMainFloor(
    snapshot,
    `${observation.sample.segment}:${observation.sample.phase}`,
    maximumFeetY,
  );
  if (observation.sample.localLifePhase !== 'alive') {
    throw new Error(
      `RELAY_ROUTE_PLAYER_NOT_ALIVE segment=${observation.sample.segment}`
      + ` phase=${observation.sample.phase}`
      + ` life=${observation.sample.localLifePhase}`
      + ` tick=${observation.sample.serverTick}`,
    );
  }
  if (observation.sample.pointerLocked !== true) {
    throw new Error(
      `RELAY_ROUTE_POINTER_LOCK_LOST segment=${observation.sample.segment}`
      + ` phase=${observation.sample.phase}`
      + ` tick=${observation.sample.serverTick}`,
    );
  }
  if (!captureOrientationWithinTolerance(
    observation.orientationResidual,
    maximumCaptureLookErrorMilliDegrees,
  )) {
    throw new Error(
      `RELAY_ROUTE_LOOK_DRIFT segment=${observation.sample.segment}`
      + ` phase=${observation.sample.phase}`
      + ` yawResidual=${observation.orientationResidual.yawMilliDegrees}`
      + ` pitchResidual=${observation.orientationResidual.pitchMilliDegrees}`
      + ` tick=${observation.sample.serverTick}`,
    );
  }
  return observation;
}

async function prepareRouteMovement(canvasBounds, segment, requiredBounds) {
  await alignCameraToCaptureFrame(canvasBounds, `${segment}_departure`);
  const snapshot = await practiceSnapshot(`${segment}:preflight`);
  return assertRouteMovementSample(
    snapshot,
    recordRouteMovementSample(
      snapshot,
      segment,
      'preflight',
      requiredBounds,
      null,
    ),
  );
}

function failureCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(' ', 1)[0];
}

async function alignCameraToCaptureFrame(canvasBounds, label) {
  if (captureMousePosition === null) {
    captureMousePosition = {
      x: canvasBounds.x + canvasBounds.width / 2,
      y: canvasBounds.y + canvasBounds.height / 2,
    };
  }
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const snapshot = await readPracticeSnapshot();
    const proof = finitePosition(snapshot, `${label}:camera_alignment`);
    const residual = captureOrientationResidual(
      proof.yawMilliDegrees,
      proof.pitchMilliDegrees,
    );
    const sample = {
      label,
      iteration,
      targetYawMilliDegrees: RELAY_CAPTURE_FRAME.yawMilliDegrees,
      targetPitchMilliDegrees: RELAY_CAPTURE_FRAME.pitchMilliDegrees,
      yawMilliDegrees: proof.yawMilliDegrees,
      pitchMilliDegrees: proof.pitchMilliDegrees,
      yawResidualMilliDegrees: residual.yawMilliDegrees,
      pitchResidualMilliDegrees: residual.pitchMilliDegrees,
    };
    if (captureOrientationWithinTolerance(
      residual,
      maximumCaptureLookErrorMilliDegrees,
    )) {
      cameraAlignmentSamples.push(Object.freeze({ ...sample, status: 'PASS' }));
      return;
    }
    const deltaX = clamp(
      Math.round(-residual.yawMilliDegrees / mouseMilliDegreesPerPixel),
      -maximumCameraCorrectionPixelsPerStep,
      maximumCameraCorrectionPixelsPerStep,
    );
    const deltaY = clamp(
      Math.round(residual.pitchMilliDegrees / mouseMilliDegreesPerPixel),
      -maximumCameraCorrectionPixelsPerStep,
      maximumCameraCorrectionPixelsPerStep,
    );
    const previousMousePosition = captureMousePosition;
    const nextMousePosition = {
      x: clamp(
        previousMousePosition.x + deltaX,
        canvasBounds.x + 1,
        canvasBounds.x + canvasBounds.width - 1,
      ),
      y: clamp(
        previousMousePosition.y + deltaY,
        canvasBounds.y + 1,
        canvasBounds.y + canvasBounds.height - 1,
      ),
    };
    const appliedMouseDelta = Object.freeze({
      x: nextMousePosition.x - previousMousePosition.x,
      y: nextMousePosition.y - previousMousePosition.y,
    });
    captureMousePosition = nextMousePosition;
    cameraAlignmentSamples.push(Object.freeze({
      ...sample,
      requestedMouseDelta: Object.freeze({ x: deltaX, y: deltaY }),
      appliedMouseDelta,
      status: 'CORRECTING',
    }));
    await page.mouse.move(captureMousePosition.x, captureMousePosition.y);
    await page.waitForTimeout(160);
  }
  const finalSnapshot = await readPracticeSnapshot();
  const finalProof = finitePosition(finalSnapshot, `${label}:camera_alignment_final`);
  const finalResidual = captureOrientationResidual(
    finalProof.yawMilliDegrees,
    finalProof.pitchMilliDegrees,
  );
  throw new Error(
    `RELAY_CAMERA_ALIGNMENT_FAILED label=${label}`
    + ` actualYaw=${finalProof.yawMilliDegrees}`
    + ` actualPitch=${finalProof.pitchMilliDegrees}`
    + ` targetYaw=${RELAY_CAPTURE_FRAME.yawMilliDegrees}`
    + ` targetPitch=${RELAY_CAPTURE_FRAME.pitchMilliDegrees}`
    + ` yawResidual=${finalResidual.yawMilliDegrees}`
    + ` pitchResidual=${finalResidual.pitchMilliDegrees}`,
  );
}

async function moveToSafeFloorTarget(
  keys,
  label,
  requiredBounds,
  timeoutMilliseconds,
  preflight,
) {
  let reached = false;
  const pressedKeys = [];
  let sampleCount = 0;
  let firstInFlightSequence = null;
  let lastInFlightSequence = null;
  let lastSample = preflight.sample;
  let outcome = 'not_started';
  let watchdog = createRouteProgressWatchdog({
    serverTick: preflight.sample.serverTick,
    distanceMillimeters: preflight.targetDelta.distance,
    timeoutMilliseconds,
    maximumStalledTicks: routeMaximumStalledTicks,
    minimumProgressMillimeters: routeMinimumProgressMillimeters,
    authorityTickMilliseconds: routeAuthorityTickMilliseconds,
  });
  try {
    try {
      for (const key of keys) {
        await page.keyboard.down(key);
        pressedKeys.push(key);
      }
      const deadline = Date.now() + timeoutMilliseconds;
      while (Date.now() < deadline) {
        await page.waitForTimeout(80);
        const snapshot = await readPracticeSnapshot();
        const observation = recordRouteMovementSample(
          snapshot,
          label,
          'in_flight',
          requiredBounds,
          sampleCount,
        );
        sampleCount += 1;
        firstInFlightSequence ??= observation.sample.sequence;
        lastInFlightSequence = observation.sample.sequence;
        lastSample = observation.sample;
        assertRouteMovementSample(snapshot, observation);
        let progress;
        try {
          progress = observeRouteProgress(watchdog, {
            serverTick: observation.sample.serverTick,
            distanceMillimeters: observation.targetDelta.distance,
          });
        } catch (error) {
          throw new Error(
            `RELAY_ROUTE_AUTHORITY_TICK_INVALID segment=${label}`
            + ` tick=${observation.sample.serverTick}`
            + ` reason=${error instanceof Error ? error.message : String(error)}`,
          );
        }
        watchdog = progress.state;
        if (progress.outcome === 'reached') {
          reached = true;
          break;
        }
        if (progress.outcome === 'stalled') {
          throw new Error(
            `RELAY_ROUTE_PROGRESS_STALLED segment=${label}`
            + ` tick=${observation.sample.serverTick}`
            + ` stalledTicks=${progress.stalledAuthorityTicks}`
            + ` distance=${observation.targetDelta.distance}`,
          );
        }
        if (progress.outcome === 'timeout') {
          throw new Error(
            `RELAY_ROUTE_TARGET_TIMEOUT segment=${label}`
            + ` target=${requiredBounds.id}`
            + ' source=authority_tick'
            + ` elapsedTicks=${progress.elapsedAuthorityTicks}`
            + ` distance=${observation.targetDelta.distance}`,
          );
        }
      }
      if (!reached) {
        throw new Error(
          `RELAY_ROUTE_TARGET_TIMEOUT segment=${label}`
          + ` target=${requiredBounds.id}`
          + ' source=wall_clock'
          + ` tick=${lastSample.serverTick}`
          + ` distance=${lastSample.targetDelta.distance}`,
        );
      }
    } finally {
      for (const key of [...pressedKeys].reverse()) await page.keyboard.up(key);
    }
    await page.waitForTimeout(180);
    const arrivalSnapshot = await practiceSnapshot(`${label}:arrival`);
    const arrival = recordRouteMovementSample(
      arrivalSnapshot,
      label,
      'arrival',
      requiredBounds,
      null,
    );
    lastSample = arrival.sample;
    assertRouteMovementSample(arrivalSnapshot, arrival);
    if (arrival.targetDelta.distance !== 0) {
      throw new Error(
        `RELAY_ROUTE_ARRIVAL_LEFT_TARGET segment=${label}`
        + ` target=${requiredBounds.id}`
        + ` distance=${arrival.targetDelta.distance}`,
      );
    }
    outcome = 'reached';
    return arrivalSnapshot;
  } catch (error) {
    outcome = failureCode(error);
    throw error;
  } finally {
    routeMovementReports.push(Object.freeze({
      segment: label,
      targetBounds: requiredBounds.id,
      keys: Object.freeze([...keys]),
      timeoutMilliseconds,
      authorityTickBudget: watchdog.maximumAuthorityTicks,
      maximumStalledTicks: routeMaximumStalledTicks,
      minimumProgressMillimeters: routeMinimumProgressMillimeters,
      preflightSampleSequence: preflight.sample.sequence,
      firstInFlightSequence,
      lastInFlightSequence,
      inFlightSampleCount: sampleCount,
      finalSampleSequence: lastSample.sequence,
      finalServerTick: lastSample.serverTick,
      finalTargetDelta: lastSample.targetDelta,
      outcome,
    }));
  }
}

async function performSafeMovementContact(requiredBounds, preflight) {
  const pressedKeys = [];
  let sampleCount = 0;
  let firstInFlightSequence = null;
  let lastInFlightSequence = null;
  let lastSample = preflight.sample;
  let outcome = 'not_started';
  try {
    try {
      await page.keyboard.down('Shift');
      pressedKeys.push('Shift');
      await page.keyboard.down('w');
      pressedKeys.push('w');
      await page.keyboard.press('Space');
      const deadline = Date.now() + 450;
      while (Date.now() < deadline) {
        await page.waitForTimeout(80);
        const snapshot = await readPracticeSnapshot();
        const observation = recordRouteMovementSample(
          snapshot,
          'movement_contact',
          'in_flight',
          requiredBounds,
          sampleCount,
        );
        sampleCount += 1;
        firstInFlightSequence ??= observation.sample.sequence;
        lastInFlightSequence = observation.sample.sequence;
        lastSample = observation.sample;
        assertRouteMovementSample(snapshot, observation, 3_500);
        if (observation.targetDelta.distance !== 0) {
          throw new Error(
            'RELAY_ROUTE_CONTACT_LEFT_TARGET_BOUNDS segment=movement_contact'
            + ` distance=${observation.targetDelta.distance}`,
          );
        }
      }
    } finally {
      for (const key of [...pressedKeys].reverse()) await page.keyboard.up(key);
    }
    await page.waitForTimeout(80);
    outcome = 'completed';
  } catch (error) {
    outcome = failureCode(error);
    throw error;
  } finally {
    routeMovementReports.push(Object.freeze({
      segment: 'movement_contact',
      targetBounds: requiredBounds.id,
      keys: Object.freeze(['Shift', 'w', 'Space']),
      timeoutMilliseconds: 450,
      authorityTickBudget: null,
      maximumStalledTicks: null,
      minimumProgressMillimeters: null,
      preflightSampleSequence: preflight.sample.sequence,
      firstInFlightSequence,
      lastInFlightSequence,
      inFlightSampleCount: sampleCount,
      finalSampleSequence: lastSample.sequence,
      finalServerTick: lastSample.serverTick,
      finalTargetDelta: lastSample.targetDelta,
      outcome,
    }));
  }
}

let menuArena = null;
let practiceBefore = null;
let practiceAfter = null;
let pointerLockAcquired = false;

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1_200);
  menuArena = await page.locator('body').getAttribute('data-menu-arena');
  await capture(
    '01-relay-menu-flythrough-1440x900.png',
    'Actual animated menu canvas with the Relay visual candidate as the sole map backdrop.',
  );

  await page.getByRole('button', { name: 'Arenas' }).click();
  await page.locator('#panel-maps').waitFor({ state: 'visible' });
  await capture(
    '02-relay-arena-selection-1440x900.png',
    'Player-facing original-arena selection with Relay as the current playable visual candidate.',
  );
  await page.getByRole('button', { name: 'Close map library' }).click();

  await page.locator('#play-btn').click();
  await page.waitForURL(/\/practice(?:\?|$)/u, { timeout: 20_000 });
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined, null, {
    timeout: 30_000,
  });
  const entryAction = page.locator('.local-practice-gate__enter');
  await entryAction.waitFor({ state: 'visible' });
  practiceBefore = await practiceSnapshot('entry_gate');
  await capture(
    '03-relay-entry-gate-1440x900.png',
    'Player-eye spawn view before capture; Relay identity, controls, HUD, and map are visible.',
  );

  const canvas = page.locator('#game-canvas');
  const canvasBox = await canvas.boundingBox();
  if (canvasBox === null) {
    throw new Error('RELAY_GAME_CANVAS_BOUNDS_UNAVAILABLE');
  }
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  captureMousePosition = {
    x: canvasBox.x + canvasBox.width / 2,
    y: canvasBox.y + canvasBox.height / 2,
  };
  await entryAction.focus();
  const entryActionFocused = await entryAction.evaluate((element) => (
    document.activeElement === element
  ));
  if (!entryActionFocused) throw new Error('RELAY_ENTRY_ACTION_FOCUS_FAILED');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot().pointerLocked === true
  ), null, { timeout: 5_000 });
  pointerLockAcquired = true;
  await page.waitForTimeout(180);

  await capture(
    '04-relay-spawn-active-1440x900.png',
    'Centered first-person west-spawn view with the live weapon mount and HUD.',
    async () => {
      await alignCameraToCaptureFrame(canvasBox, 'spawn_active');
      assertCapturedOnFloor(
        await practiceSnapshot('spawn_active'),
        'spawn_active',
        provenMainFloorRegions[0],
      );
    },
  );

  const routeOnePreflight = await prepareRouteMovement(
    canvasBox,
    'route_one',
    routeOneCaptureBounds,
  );
  await moveToSafeFloorTarget(
    ['Shift', 'w'],
    'route_one',
    routeOneCaptureBounds,
    5_000,
    routeOnePreflight,
  );
  await capture(
    '05-relay-route-one-1440x900.png',
    'Player-eye route read from the proven west connector authority floor.',
    async () => {
      await alignCameraToCaptureFrame(canvasBox, 'route_one');
      assertCapturedOnFloor(
        await practiceSnapshot('route_one'),
        'route_one',
        routeOneCaptureBounds,
      );
    },
  );

  const routeTwoPreflight = await prepareRouteMovement(
    canvasBox,
    'route_two',
    routeTwoCaptureBounds,
  );
  await moveToSafeFloorTarget(
    ['Shift', 'w'],
    'route_two',
    routeTwoCaptureBounds,
    4_000,
    routeTwoPreflight,
  );
  await capture(
    '06-relay-route-two-1440x900.png',
    'Second route read after crossing the proven connector-to-central-court seam.',
    async () => {
      await alignCameraToCaptureFrame(canvasBox, 'route_two');
      assertCapturedOnFloor(
        await practiceSnapshot('route_two'),
        'route_two',
        routeTwoCaptureBounds,
      );
    },
  );

  const movementContactPreflight = await prepareRouteMovement(
    canvasBox,
    'movement_contact',
    movementContactBounds,
  );
  await performSafeMovementContact(
    movementContactBounds,
    movementContactPreflight,
  );
  await alignCameraToCaptureFrame(canvasBox, 'movement_contact');
  await page.mouse.down({ button: 'left' });
  try {
    await capture(
      '07-relay-movement-contact-1440x900.png',
      'Grounded sprint/jump/fire sample on the proven central-court authority floor.',
      async () => {
        assertCapturedOnFloor(
          await practiceSnapshot('movement_contact'),
          'movement_contact',
          movementContactBounds,
        );
      },
      80,
    );
  } finally {
    await page.mouse.up({ button: 'left' });
  }

  await page.waitForTimeout(80);
  await alignCameraToCaptureFrame(canvasBox, 'final');
  practiceAfter = assertCapturedOnFloor(
    await practiceSnapshot('final'),
    'final',
    Object.freeze({
      ...provenMainFloorRegions[2],
      id: 'relay_floor_central_court_final',
    }),
  );
} catch (error) {
  captureFailure = Object.freeze({
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
} finally {
  await writeFile(
    path.join(outputRoot, 'runtime.partial.json'),
    `${JSON.stringify({
      schema: capturePacketSchema,
      identity: capturePacketIdentity,
      capturedAt: new Date().toISOString(),
      buildCommit,
      buildMode: 'staging-review',
      baseUrl,
      viewport: { width: 1440, height: 900 },
      routeFloorContract: {
        fixtureHash: expectedAuthorityFixtureHash,
        settledFeetY: {
          minimum: settledFloorMinimumY,
          maximum: settledFloorMaximumY,
        },
        maximumSettledVerticalSpeed: settledMaximumVerticalSpeed,
        maximumCaptureLookErrorMilliDegrees,
        captureFrame: RELAY_CAPTURE_FRAME,
        movementWatchdog: {
          authorityTickMilliseconds: routeAuthorityTickMilliseconds,
          maximumStalledTicks: routeMaximumStalledTicks,
          minimumProgressMillimeters: routeMinimumProgressMillimeters,
        },
        provenMainFloorRegions,
        routeOneCaptureBounds,
        routeTwoCaptureBounds,
      },
      menuArena,
      practiceBefore,
      practiceAfter,
      pointerLockAcquired,
      movementSnapshots,
      routeMovementSamples,
      routeMovementReports,
      routeFloorAssertions,
      cameraAlignmentSamples,
      glbResponses,
      captures,
      errors,
      captureFailure,
      nonclaims: [
        'No human visual or play acceptance is claimed.',
        'Relay Revision 1 is an original local-authority gameplay candidate and is not an accepted/release map.',
        'The paired Relay portal contract and persistent apertures are present, but this route does not claim a player-driven traversal.',
        'This bounded local run is not final 2/4/8 multiplayer or soak proof.',
        'No externally owned map geometry, textures, audio, or layout is included.',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
}

if (errors.console.length || errors.page.length || errors.requests.length) {
  throw new Error(`RELAY_RUNTIME_ERRORS ${JSON.stringify(errors)}`);
}
if (menuArena !== 'relay-visual-candidate') {
  throw new Error(`RELAY_MENU_IDENTITY_MISMATCH actual=${menuArena}`);
}
if (practiceBefore?.render3d?.presentationMode !== 'relay_visual_candidate') {
  throw new Error('RELAY_RUNTIME_PRESENTATION_MODE_MISMATCH');
}
if (practiceBefore?.render3d?.presentationDisplayName !== 'Relay') {
  throw new Error('RELAY_RUNTIME_DISPLAY_NAME_MISMATCH');
}
if (
  practiceBefore?.render3d?.presentationReference
    !== expectedPresentationReference
) {
  throw new Error(
    `RELAY_RUNTIME_PRESENTATION_REFERENCE_MISMATCH actual=${practiceBefore?.render3d?.presentationReference}`,
  );
}
if (practiceBefore?.mapId !== 'relay') {
  throw new Error(`RELAY_RUNTIME_MAP_ID_MISMATCH actual=${practiceBefore?.mapId}`);
}
if (practiceBefore?.fixtureHash !== expectedAuthorityFixtureHash) {
  throw new Error(
    `RELAY_RUNTIME_FIXTURE_HASH_MISMATCH actual=${practiceBefore?.fixtureHash}`
    + ` expected=${expectedAuthorityFixtureHash}`,
  );
}
if (
  practiceBefore?.render3d?.authorityCompatibility
    !== 'relay_revision_1_authority_candidate'
) {
  throw new Error('RELAY_RUNTIME_AUTHORITY_COMPATIBILITY_MISMATCH');
}
if (practiceBefore?.render3d?.selectedFirstPersonOverlapFree !== true) {
  throw new Error('RELAY_FIRST_PERSON_WEAPON_OVERLAP');
}
if (
  practiceBefore?.portalAuthorityCapabilityId
    !== 'relay_revision_1_linked_world_portal_v1'
) {
  throw new Error('RELAY_PORTAL_AUTHORITY_CAPABILITY_MISMATCH');
}
if (practiceBefore?.render3d?.staticWorldPortalCount !== 2) {
  throw new Error('RELAY_STATIC_PORTAL_COUNT_MISMATCH');
}
if (practiceBefore?.render3d?.staticWorldPortalMeshCount !== 10) {
  throw new Error('RELAY_STATIC_PORTAL_MESH_COUNT_MISMATCH');
}
if (practiceBefore?.render3d?.authorityColliderCount !== 56) {
  throw new Error('RELAY_AUTHORITY_COLLIDER_COUNT_MISMATCH');
}
if (practiceBefore?.render3d?.spawnCount !== 8) {
  throw new Error('RELAY_AUTHORITY_SPAWN_COUNT_MISMATCH');
}
if (practiceBefore?.render3d?.zoneCount !== 8) {
  throw new Error('RELAY_AUTHORITY_ZONE_COUNT_MISMATCH');
}
if (
  practiceBefore?.render3d?.renderMeshCount
    > maximumBasePresentationMeshCount
) {
  throw new Error(
    `RELAY_BASE_PRESENTATION_MESH_BUDGET_EXCEEDED actual=${practiceBefore?.render3d?.renderMeshCount}`,
  );
}
if (glbResponses.some(({ url }) => url.includes('inkfall_foundry_rev5_geometry_portal'))) {
  throw new Error('RELAY_RETIRED_FOUNDRY_GLB_REQUESTED');
}
if (!pointerLockAcquired) {
  throw new Error('RELAY_POINTER_LOCK_NOT_ACQUIRED');
}
if (captures.length !== 7) {
  throw new Error(`RELAY_CAPTURE_CARDINALITY_MISMATCH actual=${captures.length}`);
}
if (routeFloorAssertions.length !== 5) {
  throw new Error(
    `RELAY_ROUTE_FLOOR_ASSERTION_CARDINALITY_MISMATCH actual=${routeFloorAssertions.length}`,
  );
}
const expectedFloorAssertionLabels = Object.freeze([
  'spawn_active',
  'route_one',
  'route_two',
  'movement_contact',
  'final',
]);
if (routeFloorAssertions.some(({ label }, index) => (
  label !== expectedFloorAssertionLabels[index]
))) {
  throw new Error(
    `RELAY_ROUTE_FLOOR_ASSERTION_SEQUENCE_MISMATCH actual=${JSON.stringify(
      routeFloorAssertions.map(({ label }) => label),
    )}`,
  );
}
const expectedRouteMovementOutcomes = Object.freeze([
  Object.freeze({ segment: 'route_one', outcome: 'reached' }),
  Object.freeze({ segment: 'route_two', outcome: 'reached' }),
  Object.freeze({ segment: 'movement_contact', outcome: 'completed' }),
]);
if (routeMovementReports.length !== expectedRouteMovementOutcomes.length) {
  throw new Error(
    `RELAY_ROUTE_MOVEMENT_REPORT_CARDINALITY_MISMATCH actual=${routeMovementReports.length}`,
  );
}
for (const [index, expected] of expectedRouteMovementOutcomes.entries()) {
  const report = routeMovementReports[index];
  const preflight = routeMovementSamples[report?.preflightSampleSequence];
  const first = routeMovementSamples[report?.firstInFlightSequence];
  const last = routeMovementSamples[report?.lastInFlightSequence];
  if (
    report?.segment !== expected.segment
    || report?.outcome !== expected.outcome
    || report?.inFlightSampleCount < 1
    || preflight?.segment !== expected.segment
    || preflight?.phase !== 'preflight'
    || first?.segment !== expected.segment
    || first?.phase !== 'in_flight'
    || last?.segment !== expected.segment
    || last?.phase !== 'in_flight'
  ) {
    throw new Error(
      `RELAY_ROUTE_MOVEMENT_REPORT_INVALID expected=${expected.segment}`
      + ` actual=${JSON.stringify(report)}`,
    );
  }
}

await rename(
  path.join(outputRoot, 'runtime.partial.json'),
  path.join(outputRoot, 'runtime.json'),
);

process.stdout.write(`${JSON.stringify({
  status: 'RELAY_PLAYER_EYE_V6_PACKET_CAPTURED',
  schema: capturePacketSchema,
  identity: capturePacketIdentity,
  outputRoot,
  menuArena,
  pointerLockAcquired,
  routeFloorAssertions,
  routeMovementReports,
  expectedAuthorityFixtureHash,
  presentationReference:
    practiceAfter?.render3d?.presentationReference ?? null,
  presentationMode: practiceAfter?.render3d?.presentationMode ?? null,
  presentationDisplayName: practiceAfter?.render3d?.presentationDisplayName ?? null,
  mapId: practiceAfter?.mapId ?? null,
  fixtureId: practiceAfter?.fixtureId ?? null,
  authorityColliderCount:
    practiceAfter?.render3d?.authorityColliderCount ?? null,
  spawnCount: practiceAfter?.render3d?.spawnCount ?? null,
  zoneCount: practiceAfter?.render3d?.zoneCount ?? null,
  renderMeshCount: practiceAfter?.render3d?.renderMeshCount ?? null,
  maximumBasePresentationMeshCount,
  authorityCompatibility: practiceAfter?.render3d?.authorityCompatibility ?? null,
  remoteAvatarCount: practiceAfter?.render3d?.remoteAvatarCount ?? null,
  firstPersonOverlapFree:
    practiceAfter?.render3d?.selectedFirstPersonOverlapFree ?? null,
  portalAuthorityCapabilityId:
    practiceAfter?.portalAuthorityCapabilityId ?? null,
  staticWorldPortalCount:
    practiceAfter?.render3d?.staticWorldPortalCount ?? null,
  staticWorldPortalMeshCount:
    practiceAfter?.render3d?.staticWorldPortalMeshCount ?? null,
  observedPortalTraversalCount:
    practiceAfter?.recentPortalTraversalEvents ?? null,
  runtimeErrorCount:
    errors.console.length + errors.page.length + errors.requests.length,
}, null, 2)}\n`);
