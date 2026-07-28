import {
  createRapierMovementWorld,
  type LoadedRuntimeMapPackage,
} from '../physics';
import {
  INTENT_BUTTON,
  asQuantizedAxis,
  asMillimeters,
  type PlayerIntentCommand,
} from '../sim';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  createMovementSimulationState,
  stepMovementSimulation,
  type Vector3Millimeters,
} from '../sim/movement';
import { INKFALL_REV4_CANDIDATE_AUTHORITY } from './inkfallRev4CandidateBinding';

const SOLID_LAYERS = [
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const;
const ROUTE_WAYPOINTS_MM = Object.freeze([
  Object.freeze({ x: -13_400, y: 300, z: 2_000 }),
  Object.freeze({ x: -16_000, y: 2_000, z: 7_000 }),
  Object.freeze({ x: -19_000, y: 4_000, z: 12_000 }),
  Object.freeze({ x: -22_000, y: 6_000, z: 17_000 }),
] as const);
const PLANAR_TOLERANCE_MM = 900;
const VERTICAL_TOLERANCE_MM = 1_600;
const MAX_TICKS = 800;
const MAX_STAGNANT_TICKS = 40;
const PROGRESS_THRESHOLD_MM = 250;
const RULESET_HASH = '0000000000000000';

function feet(source: Readonly<{ x: number; y: number; z: number }>): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(source.x),
    y: asMillimeters(source.y),
    z: asMillimeters(source.z),
  });
}

function containingZoneIds(
  loaded: LoadedRuntimeMapPackage,
  position: Vector3Millimeters,
): readonly string[] {
  return Object.freeze(loaded.manifest.zones.filter((zone) => (
    Math.abs(position.x - zone.centerMm.x) <= zone.halfExtentsMm.x
    && Math.abs(position.y - zone.centerMm.y) <= zone.halfExtentsMm.y
    && Math.abs(position.z - zone.centerMm.z) <= zone.halfExtentsMm.z
  )).map(({ id }) => id));
}

export async function runInkfallRev4PressArchiveTraversal(
  loaded: LoadedRuntimeMapPackage,
) {
  if (
    loaded.identity.id !== INKFALL_REV4_CANDIDATE_AUTHORITY.mapId
    || loaded.identity.revision !== INKFALL_REV4_CANDIDATE_AUTHORITY.mapRevision
    || loaded.identity.packageDigest !== INKFALL_REV4_CANDIDATE_AUTHORITY.packageDigest
    || loaded.authority.fixtureHash !== INKFALL_REV4_CANDIDATE_AUTHORITY.fixtureHash
  ) {
    throw new Error('INKFALL_REV4_TRAVERSAL_AUTHORITY_IDENTITY_MISMATCH');
  }
  const world = await createRapierMovementWorld(loaded.authority.fixture);
  const legs: {
    from: Vector3Millimeters;
    target: Vector3Millimeters;
    final: Vector3Millimeters;
    tickCount: number;
    supportColliderIds: readonly string[];
    finalOverlapColliderIds: readonly string[];
    finalZoneIds: readonly string[];
    planarRemainingMm: number;
    verticalRemainingMm: number;
    passed: boolean;
  }[] = [];
  let state = createMovementSimulationState(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, {
    rulesetId: 'inkfall.rev4.candidate.traversal',
    rulesetRevision: 1,
    rulesetHash: RULESET_HASH,
    fixtureId: world.fixture.id,
    fixtureHash: world.fixtureHash,
    physicsAdapterId: 'rapier3d.deterministic.compat',
    physicsAdapterVersion: world.runtime.version,
    playerId: 'inkfall_rev4_candidate_probe',
    feetPosition: feet(ROUTE_WAYPOINTS_MM[0]),
    grounded: true,
  });
  let targetIndex = 1;
  let legStartedAtTick = 0;
  let legStart = state.player.feetPosition;
  let bestDistanceMm = Number.POSITIVE_INFINITY;
  let stagnantTicks = 0;
  let previousHeldButtons = 0;
  const supportColliderIds = new Set<string>();
  let totalTickCount = 0;
  try {
    const startingOverlap = world.overlapCapsule({
      feetPosition: state.player.feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });
    if (startingOverlap.blockingColliderIds.length > 0) {
      throw new Error(
        `INKFALL_REV4_TRAVERSAL_START_OVERLAP ${startingOverlap.blockingColliderIds.join(',')}`,
      );
    }
    for (let authorityTick = 1; authorityTick <= MAX_TICKS && targetIndex < ROUTE_WAYPOINTS_MM.length; authorityTick += 1) {
      const target = feet(ROUTE_WAYPOINTS_MM[targetIndex]);
      const deltaX = target.x - state.player.feetPosition.x;
      const deltaZ = target.z - state.player.feetPosition.z;
      const planarRemaining = Math.hypot(deltaX, deltaZ);
      const verticalRemaining = Math.abs(target.y - state.player.feetPosition.y);
      if (
        planarRemaining <= PLANAR_TOLERANCE_MM
        && verticalRemaining <= VERTICAL_TOLERANCE_MM
      ) {
        const finalOverlapColliderIds = world.overlapCapsule({
          feetPosition: state.player.feetPosition,
          shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
          solidLayers: SOLID_LAYERS,
        }).blockingColliderIds;
        legs.push({
          from: legStart,
          target,
          final: state.player.feetPosition,
          tickCount: authorityTick - legStartedAtTick,
          supportColliderIds: Object.freeze([...supportColliderIds].sort()),
          finalOverlapColliderIds,
          finalZoneIds: containingZoneIds(loaded, state.player.feetPosition),
          planarRemainingMm: Math.round(planarRemaining),
          verticalRemainingMm: verticalRemaining,
          passed: finalOverlapColliderIds.length === 0,
        });
        targetIndex += 1;
        legStartedAtTick = authorityTick;
        legStart = state.player.feetPosition;
        bestDistanceMm = Number.POSITIVE_INFINITY;
        stagnantTicks = 0;
        supportColliderIds.clear();
        if (targetIndex >= ROUTE_WAYPOINTS_MM.length) break;
        continue;
      }
      const distanceMm = Math.round(Math.hypot(
        deltaX,
        target.y - state.player.feetPosition.y,
        deltaZ,
      ));
      if (distanceMm + PROGRESS_THRESHOLD_MM < bestDistanceMm) {
        bestDistanceMm = distanceMm;
        stagnantTicks = 0;
      } else {
        stagnantTicks += 1;
      }
      if (stagnantTicks >= MAX_STAGNANT_TICKS) {
        throw new Error(
          `INKFALL_REV4_TRAVERSAL_STAGNANT target=${JSON.stringify(target)} position=${
            JSON.stringify(state.player.feetPosition)
          }`,
        );
      }
      const magnitude = Math.max(1, Math.hypot(deltaX, deltaZ));
      const worldX = deltaX / magnitude;
      const worldZ = deltaZ / magnitude;
      const yaw = (state.player.yawMilliDegrees / 1_000) * (Math.PI / 180);
      const cosine = Math.cos(yaw);
      const sine = Math.sin(yaw);
      const heldButtons = INTENT_BUTTON.sprint;
      const command: PlayerIntentCommand = {
        kind: 'player_intent',
        sequence: authorityTick - 1,
        clientTick: state.tick,
        moveX: asQuantizedAxis(Math.round((worldX * cosine - worldZ * sine) * 127)),
        moveZ: asQuantizedAxis(Math.round((worldX * sine + worldZ * cosine) * 127)),
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons,
        pressedButtons: heldButtons & ~previousHeldButtons,
        releasedButtons: previousHeldButtons & ~heldButtons,
      };
      previousHeldButtons = heldButtons;
      const result = stepMovementSimulation(
        state,
        [command],
        PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
        world,
      );
      state = result.state;
      if (state.player.support) supportColliderIds.add(state.player.support.colliderId);
      const overlap = world.overlapCapsule({
        feetPosition: state.player.feetPosition,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      });
      if (overlap.blockingColliderIds.length > 0) {
        throw new Error(`INKFALL_REV4_TRAVERSAL_EMBED ${overlap.blockingColliderIds.join(',')}`);
      }
      totalTickCount += 1;
    }
  } finally {
    world.dispose();
  }
  const enteredZoneIds = Object.freeze([
    ...new Set(legs.flatMap(({ finalZoneIds }) => finalZoneIds)),
  ]);
  const allChecksPassed = targetIndex === ROUTE_WAYPOINTS_MM.length
    && legs.length === 3
    && legs.every(({ passed }) => passed)
    && enteredZoneIds.includes('press_hall')
    && enteredZoneIds.includes('archive_walk_west');
  if (!allChecksPassed) {
    throw new Error(`INKFALL_REV4_TRAVERSAL_ZONE_TRANSITION_FAILED ${enteredZoneIds.join(',')}`);
  }
  return Object.freeze({
    kind: 'executable_rapier_kcc_press_hall_to_west_archive_traversal',
    authorityRevision: loaded.identity.revision,
    routeId: 'press_west_archive',
    classification: 'automated_runtime_evidence_not_human_playtest',
    waypointsMm: ROUTE_WAYPOINTS_MM,
    legs: Object.freeze(legs),
    totalTickCount,
    enteredZoneIds,
    allChecksPassed,
    nonClaims: Object.freeze([
      'NOT_HUMAN_2_4_8_PLAYER_REVIEW',
      'NOT_OFFLINE_PRACTICE_MATCH_INTEGRATION',
      'G5_NOT_PASSED',
    ]),
  });
}
