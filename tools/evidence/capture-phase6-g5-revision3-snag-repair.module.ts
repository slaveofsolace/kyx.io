import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  createRapierMovementWorld,
  type PhysicsFixtureV1,
} from '../../src/physics';
import { asMillimeters } from '../../src/sim';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../src/sim/movement';

interface FixtureSnapshot {
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly collisionSha256: string;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

const MAP_ROOT = new URL('../../assets/source/maps/inkfall-foundry/', import.meta.url);
const V2_FIXTURE_URL = new URL('runtime/combat-authority-fixture.p5-10.v1.json', MAP_ROOT);
const V3_FIXTURE_URL = new URL('runtime/combat-authority-fixture.g5-revision3.v1.json', MAP_ROOT);
const V2_RENDER_URL = new URL('revisions/revision-2/export/render.graybox.glb', MAP_ROOT);
const V3_RENDER_URL = new URL('revisions/revision-3/export/render.graybox.glb', MAP_ROOT);
const V2_COLLISION_URL = new URL('revisions/revision-2/export/collision.authority.glb', MAP_ROOT);
const V3_COLLISION_URL = new URL('revisions/revision-3/export/collision.authority.glb', MAP_ROOT);
const V3_BUILD_REPORT_URL = new URL(
  'revisions/revision-3/validation/collision-revision3-build-report.json',
  MAP_ROOT,
);
const P515_DEFECT_URL = new URL(
  '../../evidence/2026-07-22/phase-5-p5-15/runtime-v10/p515-canonical-traversal-defect.json',
  import.meta.url,
);

const SOLID_LAYERS = [
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const;
const OFFENDING_RAIL_ID = 'map_collision_guard_rail_press_west_ink_s00_left';
const STUCK_FEET_POSITION = Object.freeze({
  x: asMillimeters(-16_497),
  y: asMillimeters(182),
  z: asMillimeters(-637),
});
const TARGET_FEET_POSITION = Object.freeze({ x: -14_000, y: 0, z: 2_000 });
const FORWARD_TRANSLATION = Object.freeze({
  x: asMillimeters(249),
  y: asMillimeters(0),
  z: asMillimeters(263),
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requireCondition(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

async function exactProbe(fixture: PhysicsFixtureV1) {
  const world = await createRapierMovementWorld(fixture);
  try {
    const startingOverlap = world.overlapCapsule({
      feetPosition: STUCK_FEET_POSITION,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });
    const forwardCast = world.castCapsule({
      feetPosition: STUCK_FEET_POSITION,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: FORWARD_TRANSLATION,
      contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
      solidLayers: SOLID_LAYERS,
    });
    try {
      const move = world.moveCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: FORWARD_TRANSLATION,
        settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
        solidLayers: SOLID_LAYERS,
      });
      const finalFeet = {
        x: asMillimeters(STUCK_FEET_POSITION.x + move.appliedTranslation.x),
        y: asMillimeters(STUCK_FEET_POSITION.y + move.appliedTranslation.y),
        z: asMillimeters(STUCK_FEET_POSITION.z + move.appliedTranslation.z),
      };
      const finalOverlap = world.overlapCapsule({
        feetPosition: finalFeet,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      });
      return {
        startingOverlap,
        forwardCast,
        moveOutcome: 'PASS' as const,
        move,
        finalFeet,
        finalOverlap,
      };
    } catch (error) {
      return {
        startingOverlap,
        forwardCast,
        moveOutcome: 'ERROR' as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    world.dispose();
  }
}

async function adjacentLaneProbe(fixture: PhysicsFixtureV1) {
  const planarLength = Math.hypot(
    TARGET_FEET_POSITION.x - STUCK_FEET_POSITION.x,
    TARGET_FEET_POSITION.z - STUCK_FEET_POSITION.z,
  );
  const perpendicular = {
    x: -(TARGET_FEET_POSITION.z - STUCK_FEET_POSITION.z) / planarLength,
    z: (TARGET_FEET_POSITION.x - STUCK_FEET_POSITION.x) / planarLength,
  };
  const trajectories = [];

  for (const laneOffsetMm of [-150, -100, -50, 0, 50, 100, 150]) {
    const world = await createRapierMovementWorld(fixture);
    let feet = {
      x: asMillimeters(Math.round(STUCK_FEET_POSITION.x + perpendicular.x * laneOffsetMm)),
      y: STUCK_FEET_POSITION.y,
      z: asMillimeters(Math.round(STUCK_FEET_POSITION.z + perpendicular.z * laneOffsetMm)),
    };
    let recoveryCount = 0;
    let recoveryError: string | null = null;
    let railContactCount = 0;
    let overlapCount = 0;
    let minimumDistanceMm = Infinity;
    let completedSteps = 0;
    try {
      for (let stepIndex = 0; stepIndex < 20; stepIndex += 1) {
        const dx = TARGET_FEET_POSITION.x - feet.x;
        const dz = TARGET_FEET_POSITION.z - feet.z;
        const distanceMm = Math.hypot(dx, dz);
        minimumDistanceMm = Math.min(minimumDistanceMm, distanceMm);
        if (distanceMm <= 180) break;
        const stepLengthMm = Math.min(300, distanceMm);
        try {
          const move = world.moveCapsule({
            feetPosition: feet,
            shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
            desiredTranslation: {
              x: asMillimeters(Math.round(dx * stepLengthMm / distanceMm)),
              y: asMillimeters(0),
              z: asMillimeters(Math.round(dz * stepLengthMm / distanceMm)),
            },
            settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
            solidLayers: SOLID_LAYERS,
          });
          railContactCount += move.contacts.filter((contact) => (
            contact.colliderId === OFFENDING_RAIL_ID
          )).length;
          feet = {
            x: asMillimeters(feet.x + move.appliedTranslation.x),
            y: asMillimeters(feet.y + move.appliedTranslation.y),
            z: asMillimeters(feet.z + move.appliedTranslation.z),
          };
          const overlap = world.overlapCapsule({
            feetPosition: feet,
            shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
            solidLayers: SOLID_LAYERS,
          });
          overlapCount += overlap.blockingColliderIds.length;
          completedSteps += 1;
        } catch (error) {
          recoveryCount += 1;
          recoveryError = error instanceof Error ? error.message : String(error);
          break;
        }
      }
    } finally {
      world.dispose();
    }
    minimumDistanceMm = Math.min(
      minimumDistanceMm,
      Math.hypot(TARGET_FEET_POSITION.x - feet.x, TARGET_FEET_POSITION.z - feet.z),
    );
    trajectories.push({
      laneOffsetMm,
      completedSteps,
      recoveryCount,
      recoveryError,
      railContactCount,
      overlapCount,
      minimumDistanceMm,
      finalFeet: feet,
    });
  }
  return trajectories;
}

export async function capturePhase6G5Revision3SnagRepair() {
  const [
    revision2FixtureBytes,
    revision3FixtureBytes,
    revision2RenderBytes,
    revision3RenderBytes,
    revision2CollisionBytes,
    revision3CollisionBytes,
    revision3BuildReportBytes,
    p515DefectBytes,
  ] = await Promise.all([
    readFile(V2_FIXTURE_URL),
    readFile(V3_FIXTURE_URL),
    readFile(V2_RENDER_URL),
    readFile(V3_RENDER_URL),
    readFile(V2_COLLISION_URL),
    readFile(V3_COLLISION_URL),
    readFile(V3_BUILD_REPORT_URL),
    readFile(P515_DEFECT_URL),
  ]);
  const revision2 = JSON.parse(revision2FixtureBytes.toString('utf8')) as FixtureSnapshot;
  const revision3 = JSON.parse(revision3FixtureBytes.toString('utf8')) as FixtureSnapshot;
  const buildReport = JSON.parse(revision3BuildReportBytes.toString('utf8')) as {
    readonly status: string;
    readonly preservation: {
      readonly renderUnchanged: boolean;
      readonly allNonTargetCollidersUnchanged: boolean;
      readonly colliderCardinalityUnchanged: boolean;
    };
  };

  const revision2Exact = await exactProbe(revision2.fixture);
  const revision3Exact = await exactProbe(revision3.fixture);
  const adjacentLanes = await adjacentLaneProbe(revision3.fixture);
  const changedColliderIds = revision2.fixture.solids.flatMap((solid, index) => (
    JSON.stringify(solid) === JSON.stringify(revision3.fixture.solids[index]) ? [] : [solid.id]
  ));
  const revision2Rail = revision2.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);
  const revision3Rail = revision3.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);

  requireCondition(revision2.mapRevision === 2, 'REVISION_2_FIXTURE_IDENTITY_DRIFT');
  requireCondition(revision3.mapRevision === 3, 'REVISION_3_FIXTURE_IDENTITY_DRIFT');
  requireCondition(revision2.fixtureHash === 'bf85e42731fd088e', 'REVISION_2_HASH_DRIFT');
  requireCondition(revision3.fixtureHash === '31fea7ee73a12b91', 'REVISION_3_HASH_DRIFT');
  requireCondition(revision2.fixture.solids.length === 339, 'REVISION_2_CARDINALITY_DRIFT');
  requireCondition(revision3.fixture.solids.length === 339, 'REVISION_3_CARDINALITY_DRIFT');
  requireCondition(
    JSON.stringify(changedColliderIds) === JSON.stringify([OFFENDING_RAIL_ID]),
    'REVISION_3_COLLIDER_DIFF_SCOPE_DRIFT',
  );
  requireCondition(revision2Exact.moveOutcome === 'ERROR', 'REVISION_2_DEFECT_NOT_REPRODUCED');
  requireCondition(
    revision2Exact.forwardCast.hit?.colliderId === OFFENDING_RAIL_ID,
    'REVISION_2_BLOCKER_DRIFT',
  );
  requireCondition(revision3Exact.moveOutcome === 'PASS', 'REVISION_3_EXACT_MOVE_FAILED');
  requireCondition(revision3Exact.forwardCast.hit === null, 'REVISION_3_EXACT_CAST_BLOCKED');
  requireCondition(
    revision3Exact.moveOutcome === 'PASS'
      && revision3Exact.finalOverlap.blockingColliderIds.length === 0,
    'REVISION_3_EXACT_FINAL_OVERLAP',
  );
  requireCondition(
    adjacentLanes.every((lane) => (
      lane.recoveryCount === 0
      && lane.overlapCount === 0
      && lane.minimumDistanceMm < 100
    )),
    'REVISION_3_ADJACENT_LANE_REGRESSION',
  );
  requireCondition(
    revision2RenderBytes.equals(revision3RenderBytes),
    'REVISION_3_RENDER_BYTES_CHANGED',
  );
  requireCondition(buildReport.preservation.renderUnchanged, 'BUILD_REPORT_RENDER_DRIFT');
  requireCondition(
    buildReport.preservation.allNonTargetCollidersUnchanged,
    'BUILD_REPORT_NON_TARGET_COLLIDER_DRIFT',
  );
  requireCondition(
    buildReport.preservation.colliderCardinalityUnchanged,
    'BUILD_REPORT_COLLIDER_CARDINALITY_DRIFT',
  );

  return Object.freeze({
    schemaVersion: 1,
    phase: 'G5_BOUNDED_CANONICAL_TRAVERSAL_SNAG_REPAIR',
    status: 'REVISION_3_COLLISION_CANDIDATE_DETERMINISTIC_PASS',
    capturedAt: new Date().toISOString(),
    sourceDefect: {
      path: 'evidence/2026-07-22/phase-5-p5-15/runtime-v10/p515-canonical-traversal-defect.json',
      sha256: sha256(p515DefectBytes),
      exactStuckFeetPositionMm: STUCK_FEET_POSITION,
      targetFeetPositionMm: TARGET_FEET_POSITION,
    },
    immutableRevision2: {
      mapRevision: revision2.mapRevision,
      packageDigest: revision2.packageDigest,
      fixtureHash: revision2.fixtureHash,
      collisionSha256: sha256(revision2CollisionBytes),
      renderSha256: sha256(revision2RenderBytes),
      fixtureSnapshotSha256: sha256(revision2FixtureBytes),
      exactProbe: revision2Exact,
    },
    revision3Candidate: {
      mapRevision: revision3.mapRevision,
      packageDigest: revision3.packageDigest,
      fixtureHash: revision3.fixtureHash,
      collisionSha256: sha256(revision3CollisionBytes),
      renderSha256: sha256(revision3RenderBytes),
      fixtureSnapshotSha256: sha256(revision3FixtureBytes),
      collisionMeshNodeCount: revision3.collisionMeshNodeCount,
      changedColliderIds,
      targetColliderBefore: revision2Rail,
      targetColliderAfter: revision3Rail,
      exactProbe: revision3Exact,
      adjacentLanes,
    },
    preservation: {
      renderByteIdentical: revision2RenderBytes.equals(revision3RenderBytes),
      renderSha256Identical: sha256(revision2RenderBytes) === sha256(revision3RenderBytes),
      nonTargetCollidersByteEquivalent: changedColliderIds.length === 1,
      colliderCardinalityUnchanged: revision2.fixture.solids.length === revision3.fixture.solids.length,
      authorityVolumesUnchanged: JSON.stringify(revision2.fixture.volumes)
        === JSON.stringify(revision3.fixture.volumes),
      spawnUnchanged: JSON.stringify(revision2.fixture.spawn)
        === JSON.stringify(revision3.fixture.spawn),
      buildReportStatus: buildReport.status,
      buildReportSha256: sha256(revision3BuildReportBytes),
    },
    result: {
      exactRevision2DefectReproduced: true,
      exactRevision3CastClear: true,
      exactRevision3KccMoveApplied: true,
      exactRevision3FinalOverlapCount: 0,
      adjacentLaneCount: adjacentLanes.length,
      adjacentLaneRecoveryCount: adjacentLanes.reduce(
        (total, lane) => total + lane.recoveryCount,
        0,
      ),
      adjacentLaneOverlapCount: adjacentLanes.reduce(
        (total, lane) => total + lane.overlapCount,
        0,
      ),
      deterministicCandidatePass: true,
    },
    nonClaims: [
      'REVISION_3_NOT_DEFAULT',
      'REVISION_3_NOT_PROMOTED',
      'EXACT_PRODUCT_RUNTIME_REPLAY_NOT_RUN',
      'HUMAN_ACCEPTANCE_NOT_RUN',
      'G5_NOT_PASSED',
    ],
  });
}
