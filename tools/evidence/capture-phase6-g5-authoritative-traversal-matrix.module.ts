import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  runInkfallAuthorityPlaytest,
  type InkfallAuthorityPlaytestSuiteDefinitionV2,
} from '../../src/authority/playtest';
import { requireBundledMapPackageManifest } from '../../src/content/maps';
import {
  createRapierMovementWorld,
  loadRuntimeMapPackage,
  type PhysicsFixtureV1,
} from '../../src/physics';
import {
  asMillimeters,
  type Vector3Millimeters,
} from '../../src/sim';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../src/sim/movement';
import { capturePhase6G5Revision3SnagRepair } from './capture-phase6-g5-revision3-snag-repair.module';

interface FixtureSnapshot {
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly collisionSha256: string;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

interface DirectProbeDefinition {
  readonly id: string;
  readonly expectedStartingState: 'clear' | 'seeded_overlap_recovery';
  readonly feetPosition: Vector3Millimeters;
  readonly desiredTranslation: Vector3Millimeters;
}

const MAP_ROOT = new URL('../../assets/source/maps/inkfall-foundry/', import.meta.url);
const REVISION_3_FIXTURE_URL = new URL(
  'runtime/combat-authority-fixture.g5-revision3.v1.json',
  MAP_ROOT,
);
const PLAYTEST_TAPES_V2_URL = new URL('runtime/playtest-tapes.p6-6.v2.json', MAP_ROOT);
const SPAWN_FIXTURES_V2_URL = new URL('runtime/spawn-fixtures.p6-4.v2.json', MAP_ROOT);
const TOPOLOGY_SEED_URL = new URL('inkfall-foundry.layout-seed.v1.json', MAP_ROOT);

const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);

const WEST_ARCHIVE_FEET = Object.freeze({
  x: asMillimeters(-24_024),
  y: asMillimeters(37),
  z: asMillimeters(424),
});
const WEST_ARCHIVE_TRANSLATION = Object.freeze({
  x: asMillimeters(145),
  y: asMillimeters(0),
  z: asMillimeters(-39),
});
const WEST_ARCHIVE_ROUTE_ID = 'map_collision_route_west_choice_archive_s00';

function point(x: number, y: number, z: number): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(x),
    y: asMillimeters(y),
    z: asMillimeters(z),
  });
}

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashJson(value: unknown): string {
  return sha256(new TextEncoder().encode(JSON.stringify(value)));
}

function finalFeet(
  feetPosition: Vector3Millimeters,
  appliedTranslation: Vector3Millimeters,
): Vector3Millimeters {
  return point(
    feetPosition.x + appliedTranslation.x,
    feetPosition.y + appliedTranslation.y,
    feetPosition.z + appliedTranslation.z,
  );
}

async function runDirectProbe(
  fixture: PhysicsFixtureV1,
  definition: DirectProbeDefinition,
) {
  const world = await createRapierMovementWorld(fixture);
  try {
    const startingOverlap = world.overlapCapsule({
      feetPosition: definition.feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });
    const cast = world.castCapsule({
      feetPosition: definition.feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: definition.desiredTranslation,
      contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
      solidLayers: SOLID_LAYERS,
    });
    try {
      const move = world.moveCapsule({
        feetPosition: definition.feetPosition,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: definition.desiredTranslation,
        settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
        solidLayers: SOLID_LAYERS,
      });
      const resolvedFeet = finalFeet(definition.feetPosition, move.appliedTranslation);
      const finalOverlap = world.overlapCapsule({
        feetPosition: resolvedFeet,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      });
      const inferredRecoveryObserved = (
        startingOverlap.blockingColliderIds.length > 0
        && finalOverlap.blockingColliderIds.length === 0
      );
      return Object.freeze({
        ...definition,
        startingOverlap,
        cast,
        outcome: 'PASS' as const,
        move,
        finalFeet: resolvedFeet,
        finalOverlap,
        desiredDistanceMm: Math.hypot(
          definition.desiredTranslation.x,
          definition.desiredTranslation.y,
          definition.desiredTranslation.z,
        ),
        appliedDistanceMm: Math.hypot(
          move.appliedTranslation.x,
          move.appliedTranslation.y,
          move.appliedTranslation.z,
        ),
        successfulRecoveryCount: inferredRecoveryObserved ? 1 : 0,
        failedRecoveryCount: 0,
        recoveryError: null,
        recoveryObservation: inferredRecoveryObserved
          ? 'BOUNDED_INFERRED_START_OVERLAP_TO_FINAL_CLEAR'
          : 'NO_STARTING_OVERLAP',
        recoveryObservationSource:
          'direct deterministic overlap-before/move/overlap-after probe',
        productionRecoveryTelemetryObserved: false,
      });
    } catch (error) {
      return Object.freeze({
        ...definition,
        startingOverlap,
        cast,
        outcome: 'EXPECTED_FAIL_CLOSED' as const,
        successfulRecoveryCount: 0,
        failedRecoveryCount: 1,
        recoveryError: error instanceof Error ? error.message : String(error),
        recoveryObservation: startingOverlap.blockingColliderIds.length > 0
          ? 'BOUNDED_INFERRED_RECOVERY_FAILED_CLOSED'
          : 'NO_STARTING_OVERLAP_MOVE_FAILED_CLOSED',
        recoveryObservationSource:
          'direct deterministic overlap-before/move/overlap-after probe',
        productionRecoveryTelemetryObserved: false,
      });
    }
  } finally {
    world.dispose();
  }
}

function westArchiveApproachDefinitions(): readonly DirectProbeDefinition[] {
  const tangentX = 39;
  const tangentZ = 145;
  return Object.freeze([
    {
      id: 'approach_two_ticks_before',
      expectedStartingState: 'clear',
      feetPosition: point(-24_314, 37, 502),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'approach_one_tick_before',
      expectedStartingState: 'clear',
      feetPosition: point(-24_169, 37, 463),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'exact_runtime_v45_face',
      expectedStartingState: 'clear',
      feetPosition: WEST_ARCHIVE_FEET,
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'face_tangent_minus_160',
      expectedStartingState: 'clear',
      feetPosition: point(
        WEST_ARCHIVE_FEET.x - Math.round(tangentX * 160 / 150),
        WEST_ARCHIVE_FEET.y,
        WEST_ARCHIVE_FEET.z - Math.round(tangentZ * 160 / 150),
      ),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'face_tangent_minus_80',
      expectedStartingState: 'clear',
      feetPosition: point(
        WEST_ARCHIVE_FEET.x - Math.round(tangentX * 80 / 150),
        WEST_ARCHIVE_FEET.y,
        WEST_ARCHIVE_FEET.z - Math.round(tangentZ * 80 / 150),
      ),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'seeded_face_overlap_plus_80_recovery',
      expectedStartingState: 'seeded_overlap_recovery',
      feetPosition: point(
        WEST_ARCHIVE_FEET.x + Math.round(tangentX * 80 / 150),
        WEST_ARCHIVE_FEET.y,
        WEST_ARCHIVE_FEET.z + Math.round(tangentZ * 80 / 150),
      ),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'seeded_face_overlap_plus_160_recovery',
      expectedStartingState: 'seeded_overlap_recovery',
      feetPosition: point(
        WEST_ARCHIVE_FEET.x + Math.round(tangentX * 160 / 150),
        WEST_ARCHIVE_FEET.y,
        WEST_ARCHIVE_FEET.z + Math.round(tangentZ * 160 / 150),
      ),
      desiredTranslation: WEST_ARCHIVE_TRANSLATION,
    },
    {
      id: 'exact_face_half_translation',
      expectedStartingState: 'clear',
      feetPosition: WEST_ARCHIVE_FEET,
      desiredTranslation: point(72, 0, -20),
    },
    {
      id: 'exact_face_extended_translation',
      expectedStartingState: 'clear',
      feetPosition: WEST_ARCHIVE_FEET,
      desiredTranslation: point(218, 0, -59),
    },
  ]);
}

function westArchiveEscapeDefinitions(
  resolvedFeet: Vector3Millimeters,
): readonly DirectProbeDefinition[] {
  return Object.freeze([
    {
      id: 'escape_reverse_approach',
      expectedStartingState: 'clear',
      feetPosition: resolvedFeet,
      desiredTranslation: point(-290, 0, 78),
    },
    {
      id: 'escape_outward_normal',
      expectedStartingState: 'clear',
      feetPosition: resolvedFeet,
      desiredTranslation: point(-230, 0, -99),
    },
    {
      id: 'escape_tangent_forward',
      expectedStartingState: 'clear',
      feetPosition: resolvedFeet,
      desiredTranslation: point(99, 0, -230),
    },
    {
      id: 'escape_tangent_reverse',
      expectedStartingState: 'clear',
      feetPosition: resolvedFeet,
      desiredTranslation: point(-99, 0, 230),
    },
  ]);
}

async function runWestArchiveMatrix(fixture: PhysicsFixtureV1) {
  const approach = [];
  for (const definition of westArchiveApproachDefinitions()) {
    approach.push(await runDirectProbe(fixture, definition));
  }
  const exact = approach.find(({ id }) => id === 'exact_runtime_v45_face');
  requireCondition(exact?.outcome === 'PASS', 'WEST_ARCHIVE_EXACT_PROBE_FAILED');
  requireCondition(exact.finalOverlap.blockingColliderIds.length === 0, 'WEST_ARCHIVE_EXACT_OVERLAP');
  requireCondition(
    exact.move.contacts.every(({ colliderId }) => colliderId === WEST_ARCHIVE_ROUTE_ID),
    'WEST_ARCHIVE_EXACT_CONTACT_SCOPE_DRIFT',
  );

  const escape = [];
  for (const definition of westArchiveEscapeDefinitions(exact.finalFeet)) {
    escape.push(await runDirectProbe(fixture, definition));
  }
  return Object.freeze({
    approach: Object.freeze(approach),
    escape: Object.freeze(escape),
  });
}

function summarizeScenario(
  scenario: Awaited<ReturnType<typeof runInkfallAuthorityPlaytest>>['scenarios'][number],
) {
  const routeTapes = scenario.agents.flatMap(({ routeTapes: tapes }) => tapes);
  const routeMetrics = scenario.agents.flatMap(({ routeMetrics: metrics }) => metrics);
  return Object.freeze({
    id: scenario.id,
    playerCount: scenario.playerCount,
    status: scenario.status,
    elapsedTicks: scenario.elapsedTicks,
    elapsedMilliseconds: scenario.elapsedMilliseconds,
    agentCount: scenario.agents.length,
    completedAgentCount: scenario.agents.filter(({ completed }) => completed).length,
    routeTapeCount: routeTapes.length,
    completedRouteTapeCount: routeTapes.filter(({ completed }) => completed).length,
    routeMetricCount: routeMetrics.length,
    routeMetricPassCount: routeMetrics.filter(({ insideTargetBand }) => insideTargetBand).length,
    horizontalContacts: scenario.collision.horizontalContacts,
    uniqueBlockingColliderIds: scenario.collision.uniqueBlockingColliderIds,
    embedSamples: scenario.collision.embedSamples,
    snagEvents: scenario.collision.snagEvents,
    retainedBodyOverlapSamples: scenario.occupancy.bodyOverlapSamples,
    recoveryEntries: scenario.volumes.recoveryEntries,
    killEntries: scenario.volumes.killEntries,
    recoveryProbePassed: scenario.volumes.recoveryProbePassed,
    killPriorityProbePassed: scenario.volumes.killPriorityProbePassed,
    postRecoveryEscapePassed: scenario.volumes.postRecoveryEscapePassed,
    queryMetrics: scenario.queryMetrics,
    replayHash: scenario.replayHash,
    issueCount: scenario.issues.length,
  });
}

export async function capturePhase6G5AuthoritativeTraversalMatrix() {
  const [
    revision3FixtureBytes,
    playtestTapesV2Bytes,
    spawnFixturesV2Bytes,
    topologySeedBytes,
  ] = await Promise.all([
    readFile(REVISION_3_FIXTURE_URL),
    readFile(PLAYTEST_TAPES_V2_URL),
    readFile(SPAWN_FIXTURES_V2_URL),
    readFile(TOPOLOGY_SEED_URL),
  ]);
  const revision3 = JSON.parse(revision3FixtureBytes.toString('utf8')) as FixtureSnapshot;
  const playtestTapesV2 = JSON.parse(
    playtestTapesV2Bytes.toString('utf8'),
  ) as InkfallAuthorityPlaytestSuiteDefinitionV2;
  const savedSpawnFixturesV2 = JSON.parse(spawnFixturesV2Bytes.toString('utf8'));
  const topologySeed = JSON.parse(topologySeedBytes.toString('utf8'));

  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 2);
  const [render, collision] = await Promise.all([
    readFile(new URL(manifest.artifacts.render.path, MAP_ROOT)),
    readFile(new URL(manifest.artifacts.collision.path, MAP_ROOT)),
  ]);
  const revision2Loaded = await loadRuntimeMapPackage(manifest, { render, collision });
  const [firstAuthorityRun, secondAuthorityRun] = await Promise.all([
    runInkfallAuthorityPlaytest(
      revision2Loaded,
      playtestTapesV2,
      topologySeed,
      savedSpawnFixturesV2,
    ),
    runInkfallAuthorityPlaytest(
      revision2Loaded,
      playtestTapesV2,
      topologySeed,
      savedSpawnFixturesV2,
    ),
  ]);
  requireCondition(
    JSON.stringify(firstAuthorityRun) === JSON.stringify(secondAuthorityRun),
    'P6_6_AUTHORITY_REPLAY_DRIFT',
  );
  requireCondition(firstAuthorityRun.issueCount === 0, 'P6_6_AUTHORITY_ISSUES');
  requireCondition(firstAuthorityRun.allAutomatedThresholdsPassed, 'P6_6_AUTHORITY_THRESHOLDS');
  requireCondition(
    firstAuthorityRun.scenarios.every((scenario) => (
      scenario.status === 'PASS'
      && scenario.agents.every(({ completed }) => completed)
      && scenario.collision.embedSamples === 0
      && scenario.collision.snagEvents === 0
      && scenario.occupancy.bodyOverlapSamples === 0
      && scenario.volumes.recoveryEntries === 0
      && scenario.volumes.killEntries === 0
      && scenario.volumes.recoveryProbePassed
      && scenario.volumes.killPriorityProbePassed
      && scenario.volumes.postRecoveryEscapePassed
    )),
    'P6_6_AUTHORITY_TRAVERSAL_REGRESSION',
  );

  const [snagRepair, westArchiveFirst, westArchiveSecond] = await Promise.all([
    capturePhase6G5Revision3SnagRepair(),
    runWestArchiveMatrix(revision3.fixture),
    runWestArchiveMatrix(revision3.fixture),
  ]);
  requireCondition(
    JSON.stringify(westArchiveFirst) === JSON.stringify(westArchiveSecond),
    'WEST_ARCHIVE_MATRIX_REPLAY_DRIFT',
  );
  const failingApproach = westArchiveFirst.approach.filter((probe) => (
    probe.outcome !== 'PASS'
    || probe.finalOverlap.blockingColliderIds.length !== 0
    || (
      probe.expectedStartingState === 'clear'
        ? probe.startingOverlap.blockingColliderIds.length !== 0
        : probe.startingOverlap.blockingColliderIds.length === 0
          || probe.successfulRecoveryCount !== 1
    )
  ));
  requireCondition(
    failingApproach.length === 0,
    `WEST_ARCHIVE_APPROACH_MATRIX_REGRESSION ${JSON.stringify(failingApproach)}`,
  );
  const failingEscape = westArchiveFirst.escape.filter((probe) => (
      probe.outcome !== 'PASS'
      || probe.startingOverlap.blockingColliderIds.length !== 0
      || probe.finalOverlap.blockingColliderIds.length !== 0
    || probe.appliedDistanceMm < 50
  ));
  requireCondition(
    failingEscape.length === 0,
    `WEST_ARCHIVE_ESCAPE_MATRIX_REGRESSION ${JSON.stringify(failingEscape)}`,
  );

  const scenarioSummaries = firstAuthorityRun.scenarios.map(summarizeScenario);
  const routeTapeCount = scenarioSummaries.reduce(
    (total, scenario) => total + scenario.routeTapeCount,
    0,
  );
  const routeMetricCount = scenarioSummaries.reduce(
    (total, scenario) => total + scenario.routeMetricCount,
    0,
  );

  const deterministicCore = Object.freeze({
    revision2AuthoritySuiteHash: firstAuthorityRun.suiteHash,
    revision2ScenarioReplayHashes: firstAuthorityRun.scenarios.map(({ replayHash }) => replayHash),
    revision3SnagRepairResult: snagRepair.result,
    revision3WestArchiveApproach: westArchiveFirst.approach,
    revision3WestArchiveEscape: westArchiveFirst.escape,
  });

  return Object.freeze({
    schemaVersion: 1,
    phase: 'G5_CURRENT_AUTHORITATIVE_TRAVERSAL_MATRIX',
    status: 'BOUNDED_DETERMINISTIC_PASS_G5_OPEN',
    capturedAt: new Date().toISOString(),
    bindings: Object.freeze({
      movementProfileId: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id,
      movementProfileRevision: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision,
      physicsAdapterVersion: '0.19.3',
      authorityRateHz: 20,
      revision2: Object.freeze({
        mapRevision: manifest.revision,
        packageDigest: manifest.identity.digest,
        fixtureHash: revision2Loaded.authority.fixtureHash,
        collisionSha256: sha256(collision),
        playtestTapesSha256: sha256(playtestTapesV2Bytes),
        spawnFixturesSha256: sha256(spawnFixturesV2Bytes),
        topologySeedSha256: sha256(topologySeedBytes),
      }),
      revision3: Object.freeze({
        mapRevision: revision3.mapRevision,
        packageDigest: revision3.packageDigest,
        fixtureHash: revision3.fixtureHash,
        collisionSha256: revision3.collisionSha256,
        collisionMeshNodeCount: revision3.collisionMeshNodeCount,
        fixtureSnapshotSha256: sha256(revision3FixtureBytes),
      }),
    }),
    revision2AuthorityPlaytest: Object.freeze({
      status: firstAuthorityRun.status,
      suiteHash: firstAuthorityRun.suiteHash,
      repeatedReplayByteIdentical: true,
      issueCount: firstAuthorityRun.issueCount,
      allAutomatedThresholdsPassed: firstAuthorityRun.allAutomatedThresholdsPassed,
      scenarios: Object.freeze(scenarioSummaries),
      totals: Object.freeze({
        scenarioCount: scenarioSummaries.length,
        playerArrangements: scenarioSummaries.map(({ playerCount }) => playerCount),
        agentCount: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.agentCount,
          0,
        ),
        completedAgentCount: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.completedAgentCount,
          0,
        ),
        routeTapeCount,
        completedRouteTapeCount: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.completedRouteTapeCount,
          0,
        ),
        routeMetricCount,
        routeMetricPassCount: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.routeMetricPassCount,
          0,
        ),
        embedSamples: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.embedSamples,
          0,
        ),
        snagEvents: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.snagEvents,
          0,
        ),
        retainedBodyOverlapSamples: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.retainedBodyOverlapSamples,
          0,
        ),
        recoveryEntries: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.recoveryEntries,
          0,
        ),
        killEntries: scenarioSummaries.reduce(
          (total, scenario) => total + scenario.killEntries,
          0,
        ),
      }),
    }),
    revision3CanonicalPressJunction: Object.freeze({
      sourceEvidence: snagRepair.sourceDefect,
      exactRevision2: snagRepair.immutableRevision2.exactProbe,
      exactRevision3: snagRepair.revision3Candidate.exactProbe,
      adjacentLanes: snagRepair.revision3Candidate.adjacentLanes,
      result: snagRepair.result,
    }),
    revision3WestArchive: Object.freeze({
      recoveryCountSemantics:
        'BOUNDED_INFERRED_OBSERVATION_FROM_STARTING_OVERLAP_AND_FINAL_CLEAR_NOT_PRODUCTION_TELEMETRY',
      sourcePose: Object.freeze({
        feetPositionMm: WEST_ARCHIVE_FEET,
        desiredTranslationMm: WEST_ARCHIVE_TRANSLATION,
        contactColliderId: WEST_ARCHIVE_ROUTE_ID,
      }),
      repeatedReplayByteIdentical: true,
      approach: westArchiveFirst.approach,
      escape: westArchiveFirst.escape,
      totals: Object.freeze({
        approachProbeCount: westArchiveFirst.approach.length,
        approachPassCount: westArchiveFirst.approach.filter(
          ({ outcome }) => outcome === 'PASS',
        ).length,
        approachSeededOverlapCount: westArchiveFirst.approach.filter(
          ({ expectedStartingState }) => expectedStartingState === 'seeded_overlap_recovery',
        ).length,
        approachSuccessfulRecoveryCount: westArchiveFirst.approach.reduce(
          (total, probe) => total + probe.successfulRecoveryCount,
          0,
        ),
        approachFailedRecoveryCount: westArchiveFirst.approach.reduce(
          (total, probe) => total + probe.failedRecoveryCount,
          0,
        ),
        approachStartingOverlapCount: westArchiveFirst.approach.reduce(
          (total, probe) => total + probe.startingOverlap.blockingColliderIds.length,
          0,
        ),
        approachFinalOverlapCount: westArchiveFirst.approach.reduce(
          (total, probe) => (
            total + (probe.outcome === 'PASS' ? probe.finalOverlap.blockingColliderIds.length : 0)
          ),
          0,
        ),
        escapeProbeCount: westArchiveFirst.escape.length,
        escapePassCount: westArchiveFirst.escape.filter(
          ({ outcome }) => outcome === 'PASS',
        ).length,
        escapeSuccessfulRecoveryCount: westArchiveFirst.escape.reduce(
          (total, probe) => total + probe.successfulRecoveryCount,
          0,
        ),
        escapeFailedRecoveryCount: westArchiveFirst.escape.reduce(
          (total, probe) => total + probe.failedRecoveryCount,
          0,
        ),
        escapeFinalOverlapCount: westArchiveFirst.escape.reduce(
          (total, probe) => (
            total + (probe.outcome === 'PASS' ? probe.finalOverlap.blockingColliderIds.length : 0)
          ),
          0,
        ),
      }),
    }),
    deterministicCoreSha256: hashJson(deterministicCore),
    result: Object.freeze({
      revision2SyntheticAuthorityArrangementsPass: true,
      revision2RepeatedReplayByteIdentical: true,
      revision2AllRoutesComplete: true,
      revision2ZeroEmbeds: true,
      revision2ZeroSnags: true,
      revision2ZeroRetainedBodyOverlaps: true,
      revision2RecoveryAndEscapeProbesPass: true,
      revision3CanonicalPressJunctionPass: true,
      revision3CanonicalAdjacentLaneCount: snagRepair.result.adjacentLaneCount,
      revision3CanonicalAdjacentLaneRecoveryCount:
        snagRepair.result.adjacentLaneRecoveryCount,
      revision3CanonicalAdjacentLaneOverlapCount:
        snagRepair.result.adjacentLaneOverlapCount,
      revision3WestArchiveApproachPass: true,
      revision3WestArchiveEscapePass: true,
      preservesExpectedRevision2P515FailClosedEmbed: true,
    }),
    nonClaims: Object.freeze([
      'SYNTHETIC_AUTOMATED_MATRIX_ONLY',
      'REVISION_2_AND_REVISION_3_EVIDENCE_ARE_EXPLICITLY_SEPARATED',
      'REVISION_3_NOT_DEFAULT_OR_PROMOTED',
      'EXACT_PRODUCT_BROWSER_ROUTE_NOT_REPLAYED',
      'HUMAN_2_4_8_PLAYTEST_NOT_RUN',
      'HUMAN_FUN_COUNTERPLAY_AND_READABILITY_NOT_ACCEPTED',
      'FINAL_ART_AND_PERFORMANCE_NOT_ACCEPTED',
      'RECOVERY_COUNTS_ARE_BOUNDED_INFERENCES_NOT_PRODUCTION_TELEMETRY',
      'G5_NOT_PASSED',
    ]),
  });
}
