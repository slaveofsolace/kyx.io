import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const PHASE2_FOUNDATION_HASH = 'd7201dfc006e72ee';
const SOURCE_FINGERPRINT_PATHS = Object.freeze([
  'package.json',
  'package-lock.json',
  'src/sim/movement/profile.ts',
  'src/physics/fixtures/catalog.ts',
  'src/physics/fixtures/tapeCatalog.ts',
  'src/physics/fixtures/recordedTapeResults.ts',
  'src/physics/rapier/world.ts',
]);

function option(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function serializeError(error) {
  return {
    name: error?.name ?? null,
    message: error?.message ?? String(error),
    stack: error?.stack ?? null,
  };
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function jsonSnapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function measuredNumber(capturedTape, field) {
  const measurement = capturedTape.result.measurements[field];
  if (measurement?.status !== 'measured' || !Number.isSafeInteger(measurement.value)) {
    throw new Error(`${capturedTape.id}.${field} must be a measured integer`);
  }
  return measurement.value;
}

function timingMetric(id, label, ticks, minimumMs, maximumMs, rateHz) {
  const actualMs = (ticks * 1_000) / rateHz;
  return {
    id,
    label,
    evidenceLabel: 'HYPOTHESIS',
    ticks,
    actualMs,
    targetBandMs: [minimumMs, maximumMs],
    passed: actualMs >= minimumMs && actualMs <= maximumMs,
  };
}

const repositoryRoot = path.resolve(option('repository-root', '.'));
const requestedOutputDirectory = option(
  'output-dir',
  'evidence/2026-07-20/phase-3-movement-collision',
);
const outputDirectory = path.isAbsolute(requestedOutputDirectory)
  ? path.normalize(requestedOutputDirectory)
  : path.resolve(repositoryRoot, requestedOutputDirectory);
const outputPath = path.join(outputDirectory, 'movement-tapes.json');
const allowOverwrite = process.argv.includes('--allow-overwrite');

const evidence = {
  schemaVersion: 1,
  artifactScope: 'AUTOMATED_NODE_TAPE_CAPTURE',
  g2GateStatus: 'OPEN_PENDING_COMPLETE_CLEAN_BROWSER_MANUAL_AND_MANIFEST_EVIDENCE',
  capturedAt: new Date().toISOString(),
  evidenceLabel: 'HYPOTHESIS',
  productStatus: 'NON_PRODUCT_FIXTURE_EVIDENCE',
  repositoryRoot,
  runtime: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  requirements: {
    authorityRateHz: 20,
    repeatRunsPerTape: 2,
    canonicalReplaySummaryComparison: true,
    queryOrderAndNoOverlapEvidence:
      'Covered by the permanent fixtureTapeCatalog integration suite and sealed separately in the G2 check log.',
    protectedPhase2Hash: PHASE2_FOUNDATION_HASH,
  },
  units: {
    authorityTime: 'ticks and milliseconds',
    positionAndDistance: 'integer millimeters',
    velocityAndSpeed: 'integer millimeters per second',
    orientation: 'integer milli-degrees',
    contactNormals: 'signed Q15 integers',
  },
  scopeDecisions: {
    twoClientReconciliation: {
      status: 'deferred',
      destination: 'Phase 4 / G3 authoritative two-browser movement',
      reason: 'The ordered backlog, G3 definition, and ADR-003 assign network reconciliation to Phase 4; G2 proves local deterministic movement only.',
    },
    movingPlatformTrajectory: {
      status: 'not_claimed',
      reason: 'Phase 3 validates the query DTO/support seam but does not claim complete moving-platform behavior without a real trajectory tape.',
    },
  },
  movementProfile: null,
  sourceFingerprints: [],
  phase2Foundation: null,
  tuningWorksheet: [],
  tapes: [],
  errors: [],
  ok: false,
};

await mkdir(outputDirectory, { recursive: true });
if (!allowOverwrite) {
  const existingOutput = await stat(outputPath).then(() => true).catch(() => false);
  if (existingOutput) {
    throw new Error(
      `Refusing to overwrite existing evidence: ${outputPath}. Use a fresh --output-dir or --allow-overwrite for a deliberate development rerun.`,
    );
  }
}

let vite;
try {
  for (const relativePath of SOURCE_FINGERPRINT_PATHS) {
    const buffer = await readFile(path.join(repositoryRoot, relativePath));
    evidence.sourceFingerprints.push({
      path: relativePath,
      bytes: buffer.byteLength,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    });
  }
  vite = await createServer({
    root: repositoryRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true },
  });
  const physics = await vite.ssrLoadModule('/src/physics/index.ts');
  const foundation = await vite.ssrLoadModule('/src/sim/foundationFixture.ts');
  const simulation = await vite.ssrLoadModule('/src/sim/index.ts');

  const profile = simulation.PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
  const profileHash = simulation.hashMovementProfile(profile);
  evidence.movementProfile = {
    id: profile.id,
    revision: profile.revision,
    hash: profileHash,
    evidenceLabel: profile.provenance.evidenceLabel,
    implementationStatus: profile.implementationStatus,
    values: jsonSnapshot(profile),
  };

  const firstFoundation = foundation.runFoundationDeterministicReplay();
  const secondFoundation = foundation.runFoundationDeterministicReplay();
  if (JSON.stringify(firstFoundation) !== JSON.stringify(secondFoundation)) {
    throw new Error('PHASE2_FOUNDATION_REPEAT_MISMATCH');
  }
  if (firstFoundation.finalStateHash !== PHASE2_FOUNDATION_HASH) {
    throw new Error(
      `PHASE2_FOUNDATION_HASH_DRIFT expected ${PHASE2_FOUNDATION_HASH}, received ${firstFoundation.finalStateHash}`,
    );
  }
  evidence.phase2Foundation = {
    expectedHash: PHASE2_FOUNDATION_HASH,
    firstHash: firstFoundation.finalStateHash,
    secondHash: secondFoundation.finalStateHash,
    repeatConfirmed: true,
    summary: jsonSnapshot(firstFoundation),
  };

  for (const tapeId of physics.PHYSICS_FIXTURE_TAPE_IDS) {
    const tape = physics.getPhysicsFixtureTape(tapeId);
    const first = await physics.runPhysicsFixtureTape(tapeId);
    physics.assertPhysicsFixtureTapeResult(tape, first);
    const second = await physics.runPhysicsFixtureTape(tapeId);
    physics.assertPhysicsFixtureTapeResult(tape, second);
    const firstSummary = physics.summarizePhysicsFixtureTapeResult(tape, first);
    const secondSummary = physics.summarizePhysicsFixtureTapeResult(tape, second);
    const firstSerialized = JSON.stringify(firstSummary);
    const secondSerialized = JSON.stringify(secondSummary);
    if (firstSerialized !== secondSerialized) {
      throw new Error(`PHYSICS_FIXTURE_TAPE_REPEAT_MISMATCH:${tapeId}`);
    }
    evidence.tapes.push({
      id: tape.id,
      schemaVersion: tape.schemaVersion,
      simulationRateHz: tape.simulationRateHz,
      frameCount: tape.frames.length,
      movementReplaySchemaVersion: tape.movementReplaySchemaVersion,
      movementStateSchemaVersion: tape.movementStateSchemaVersion,
      fixtureSchemaVersion: tape.fixtureSchemaVersion,
      identity: jsonSnapshot(tape.identity),
      start: jsonSnapshot(tape.start),
      frames: jsonSnapshot(tape.frames),
      canonicalInputSha256: digest({
        schemaVersion: tape.schemaVersion,
        movementReplaySchemaVersion: tape.movementReplaySchemaVersion,
        movementStateSchemaVersion: tape.movementStateSchemaVersion,
        fixtureSchemaVersion: tape.fixtureSchemaVersion,
        simulationRateHz: tape.simulationRateHz,
        identity: tape.identity,
        start: tape.start,
        frames: tape.frames,
      }),
      recordedFinalHash: tape.expected.finalHash,
      firstFinalHash: first.finalHash,
      secondFinalHash: second.finalHash,
      firstSummarySha256: digest(firstSummary),
      secondSummarySha256: digest(secondSummary),
      repeatConfirmed: true,
      recordedMatch: firstSerialized === JSON.stringify(tape.expected),
      result: jsonSnapshot(firstSummary),
    });
  }

  const flat = physics.getPhysicsFixtureTape('flat_run_fixed_20hz_v1');
  if (flat.identity.movementProfileHash !== profileHash) {
    throw new Error(
      `PHASE3_MOVEMENT_PROFILE_HASH_DRIFT expected ${flat.identity.movementProfileHash}, received ${profileHash}`,
    );
  }
  const capturedTape = (id) => {
    const captured = evidence.tapes.find((entry) => entry.id === id);
    if (!captured) throw new Error(`Missing captured tape: ${id}`);
    return captured;
  };
  const acceleration = capturedTape('flat_run_accel_brake_20hz_v1');
  const capturedFlat = capturedTape('flat_run_fixed_20hz_v1');
  const coyote = capturedTape('flat_run_coyote_accept_20hz_v1');
  const buffer = capturedTape('flat_run_buffer_accept_20hz_v1');
  const slide = capturedTape('slide_lab_collision_20hz_v1');
  const rateHz = flat.simulationRateHz;
  evidence.tuningWorksheet = [
    timingMetric(
      'ground_speed_90_percent',
      'Ground speed attainment',
      measuredNumber(acceleration, 'speed90AttainmentTicks'),
      100,
      180,
      rateHz,
    ),
    timingMetric(
      'braking_to_stop',
      'Stop from full run',
      measuredNumber(acceleration, 'brakingToStopTicks'),
      120,
      250,
      rateHz,
    ),
    timingMetric(
      'jump_time_to_apex',
      'Jump apex time',
      measuredNumber(capturedFlat, 'jumpTimeToApexTicks'),
      450,
      700,
      rateHz,
    ),
    timingMetric(
      'jump_total_airtime',
      'Total jump airtime',
      measuredNumber(capturedFlat, 'jumpAirtimeTicks'),
      900,
      1_350,
      rateHz,
    ),
    timingMetric(
      'coyote_window',
      'Coyote window',
      measuredNumber(coyote, 'coyoteJumpWindowTicks'),
      50,
      100,
      rateHz,
    ),
    timingMetric(
      'jump_buffer',
      'Jump buffer',
      measuredNumber(buffer, 'bufferedJumpLeadTicks'),
      50,
      120,
      rateHz,
    ),
    timingMetric(
      'slide_useful_duration',
      'Slide useful duration',
      measuredNumber(slide, 'slideDurationTicks'),
      450,
      900,
      rateHz,
    ),
  ];
  const failedMetrics = evidence.tuningWorksheet.filter((metric) => !metric.passed);
  if (failedMetrics.length > 0) {
    throw new Error(`PHASE3_TUNING_BAND_FAILURE:${failedMetrics.map((metric) => metric.id).join(',')}`);
  }

  const deferredRecovery =
    capturedFlat.result.measurements.weaponReadyRecoveryMilliseconds;
  if (
    deferredRecovery.status !== 'not_measured'
    || deferredRecovery.value !== null
    || deferredRecovery.reason !== 'weapon_ready_recovery_out_of_scope'
  ) {
    throw new Error('PHASE3_WEAPON_RECOVERY_LIMIT_DRIFT');
  }
  evidence.limits = {
    weaponReadyRecoveryMilliseconds: jsonSnapshot(deferredRecovery),
    movingPlatform: 'not_claimed_in_phase3',
    multiplayerAuthority: 'deferred_to_phase4_g3',
  };

  if (evidence.tapes.length !== physics.PHYSICS_FIXTURE_TAPE_IDS.length) {
    throw new Error('PHASE3_TAPE_COUNT_MISMATCH');
  }
  if (evidence.tapes.some((tape) => !tape.repeatConfirmed || !tape.recordedMatch)) {
    throw new Error('PHASE3_TAPE_EVIDENCE_INCOMPLETE');
  }
  evidence.ok = true;
} catch (error) {
  evidence.errors.push(serializeError(error));
} finally {
  await vite?.close().catch((error) => evidence.errors.push(serializeError(error)));
}

evidence.completedAt = new Date().toISOString();
evidence.ok = evidence.ok && evidence.errors.length === 0;
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  ok: evidence.ok,
  outputPath,
  tapes: evidence.tapes.length,
  tuningMetrics: evidence.tuningWorksheet.length,
  errors: evidence.errors,
}, null, 2)}\n`);
if (!evidence.ok) process.exitCode = 1;
