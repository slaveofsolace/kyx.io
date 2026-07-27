import {
  createRapierMovementWorld,
  type LoadedRuntimeMapPackage,
  type PhysicsFixtureV1,
} from '../physics';
import {
  asMillimeters,
} from '../sim';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  type Vector3Millimeters,
} from '../sim/movement';

const SOLID_LAYERS = [
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const;
const ROUTE_STEP_MM = 200;
const ROUTE_COMPLETION_TOLERANCE_MM = 150;
const EYE_HEIGHT_MM = 1_600;

interface PlanPoint {
  readonly x: number;
  readonly z: number;
}

interface RouteDefinition {
  readonly id: string;
  readonly label: string;
  readonly intent: string;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
}

interface SightlineDefinition {
  readonly id: string;
  readonly label: string;
  readonly intent: 'sniper_lane' | 'shotgun_counter_cover' | 'power_position_counter';
  readonly start: PlanPoint;
  readonly end: PlanPoint;
  readonly expectedBlockerIds: readonly string[];
}

export const INKFALL_REV3_ROUTE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'west_shotgun_breach',
    label: 'West shotgun breach',
    intent: 'close_entry',
    start: [-9_000, 0, -3_000] as const,
    end: [-3_000, 0, -3_000] as const,
  }),
  Object.freeze({
    id: 'east_shotgun_breach',
    label: 'East shotgun breach',
    intent: 'close_entry',
    start: [9_000, 0, -3_000] as const,
    end: [3_000, 0, -3_000] as const,
  }),
  Object.freeze({
    id: 'press_core_south_north',
    label: 'Press Core south–north',
    intent: 'mid_traversal',
    start: [0, 0, -2_800] as const,
    end: [0, 0, 2_800] as const,
  }),
] as const satisfies readonly RouteDefinition[]);

export const INKFALL_REV3_SIGHTLINE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'sniper_lane_west_to_east',
    label: 'West-to-east sniper lane',
    intent: 'sniper_lane',
    start: Object.freeze({ x: -14_000, z: -4_000 }),
    end: Object.freeze({ x: 14_000, z: -3_000 }),
    expectedBlockerIds: Object.freeze([]),
  }),
  Object.freeze({
    id: 'sniper_lane_east_to_west',
    label: 'East-to-west sniper lane',
    intent: 'sniper_lane',
    start: Object.freeze({ x: 14_000, z: -4_000 }),
    end: Object.freeze({ x: -14_000, z: -3_000 }),
    expectedBlockerIds: Object.freeze([]),
  }),
  Object.freeze({
    id: 'west_baffle_counter_cover',
    label: 'West breach hard cover',
    intent: 'shotgun_counter_cover',
    start: Object.freeze({ x: -9_000, z: -4_000 }),
    end: Object.freeze({ x: -3_000, z: -4_000 }),
    expectedBlockerIds: Object.freeze(['map_collision_module_press_baffle_w_inner']),
  }),
  Object.freeze({
    id: 'east_baffle_counter_cover',
    label: 'East breach hard cover',
    intent: 'shotgun_counter_cover',
    start: Object.freeze({ x: 9_000, z: -4_000 }),
    end: Object.freeze({ x: 3_000, z: -4_000 }),
    expectedBlockerIds: Object.freeze(['map_collision_module_press_baffle_e_inner']),
  }),
  Object.freeze({
    id: 'north_reactor_counter',
    label: 'North reactor power-position counter',
    intent: 'power_position_counter',
    start: Object.freeze({ x: 0, z: -4_000 }),
    end: Object.freeze({ x: 0, z: 14_000 }),
    expectedBlockerIds: Object.freeze(['map_collision_module_press_reactor_north']),
  }),
] as const satisfies readonly SightlineDefinition[]);

function feetPosition(source: readonly [number, number, number]): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(source[0]),
    y: asMillimeters(source[1]),
    z: asMillimeters(source[2]),
  });
}

function segmentIntersectsSolidAtEyeHeight(
  start: PlanPoint,
  end: PlanPoint,
  solid: PhysicsFixtureV1['solids'][number],
): boolean {
  if (solid.shape.type !== 'box') return false;
  const half = solid.shape.halfExtentsMm;
  if (
    EYE_HEIGHT_MM < solid.centerMm.y - half.y
    || EYE_HEIGHT_MM > solid.centerMm.y + half.y
  ) {
    return false;
  }

  const inverseYaw = -(solid.rotationMilliDegrees.y / 1_000) * (Math.PI / 180);
  const cosine = Math.cos(inverseYaw);
  const sine = Math.sin(inverseYaw);
  const localPoint = (point: PlanPoint) => {
    const translatedX = point.x - solid.centerMm.x;
    const translatedZ = point.z - solid.centerMm.z;
    return Object.freeze({
      x: translatedX * cosine - translatedZ * sine,
      z: translatedX * sine + translatedZ * cosine,
    });
  };
  const localStart = localPoint(start);
  const localEnd = localPoint(end);
  const deltaX = localEnd.x - localStart.x;
  const deltaZ = localEnd.z - localStart.z;
  let minimumT = 0;
  let maximumT = 1;

  for (const [origin, delta, extent] of [
    [localStart.x, deltaX, half.x],
    [localStart.z, deltaZ, half.z],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < -extent || origin > extent) return false;
      continue;
    }
    const first = (-extent - origin) / delta;
    const second = (extent - origin) / delta;
    minimumT = Math.max(minimumT, Math.min(first, second));
    maximumT = Math.min(maximumT, Math.max(first, second));
    if (minimumT > maximumT) return false;
  }
  return maximumT >= 0 && minimumT <= 1;
}

function sightlineAudit(loaded: LoadedRuntimeMapPackage) {
  return Object.freeze(INKFALL_REV3_SIGHTLINE_DEFINITIONS.map((definition) => {
    const blockingColliderIds = loaded.authority.fixture.solids
      .filter((solid) => segmentIntersectsSolidAtEyeHeight(
        definition.start,
        definition.end,
        solid,
      ))
      .map(({ id }) => id);
    const distanceMm = Math.round(Math.hypot(
      definition.end.x - definition.start.x,
      definition.end.z - definition.start.z,
    ));
    return Object.freeze({
      ...definition,
      eyeHeightMm: EYE_HEIGHT_MM,
      distanceMm,
      blockingColliderIds: Object.freeze(blockingColliderIds),
      passed: blockingColliderIds.join('|') === definition.expectedBlockerIds.join('|'),
    });
  }));
}

async function routeAudit(
  loaded: LoadedRuntimeMapPackage,
  definition: RouteDefinition,
) {
  const world = await createRapierMovementWorld(loaded.authority.fixture);
  try {
    let current = feetPosition(definition.start);
    const target = feetPosition(definition.end);
    const contactIds = new Set<string>();
    let stepCount = 0;
    let snagCount = 0;
    let overlapSampleCount = 0;
    let error: string | null = null;

    while (stepCount < 192) {
      const remainingX = target.x - current.x;
      const remainingZ = target.z - current.z;
      const remainingDistance = Math.hypot(remainingX, remainingZ);
      if (remainingDistance <= ROUTE_COMPLETION_TOLERANCE_MM) break;
      const scale = Math.min(1, ROUTE_STEP_MM / remainingDistance);
      const desired = Object.freeze({
        x: asMillimeters(Math.round(remainingX * scale)),
        y: asMillimeters(0),
        z: asMillimeters(Math.round(remainingZ * scale)),
      });
      try {
        const move = world.moveCapsule({
          feetPosition: current,
          shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
          desiredTranslation: desired,
          settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
          solidLayers: SOLID_LAYERS,
        });
        move.contacts.forEach(({ colliderId }) => contactIds.add(colliderId));
        const desiredPlanar = Math.hypot(desired.x, desired.z);
        const appliedPlanar = Math.hypot(
          move.appliedTranslation.x,
          move.appliedTranslation.z,
        );
        if (appliedPlanar < desiredPlanar * 0.5) snagCount += 1;
        current = Object.freeze({
          x: asMillimeters(current.x + move.appliedTranslation.x),
          y: asMillimeters(current.y + move.appliedTranslation.y),
          z: asMillimeters(current.z + move.appliedTranslation.z),
        });
        overlapSampleCount += world.overlapCapsule({
          feetPosition: current,
          shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
          solidLayers: SOLID_LAYERS,
        }).blockingColliderIds.length;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        break;
      }
      stepCount += 1;
    }

    const remainingDistanceMm = Math.round(Math.hypot(
      target.x - current.x,
      target.z - current.z,
    ));
    return Object.freeze({
      id: definition.id,
      label: definition.label,
      intent: definition.intent,
      startFeetMm: feetPosition(definition.start),
      targetFeetMm: target,
      finalFeetMm: current,
      stepCount,
      snagCount,
      overlapSampleCount,
      remainingDistanceMm,
      contactIds: Object.freeze([...contactIds].sort()),
      error,
      passed: error === null
        && snagCount === 0
        && overlapSampleCount === 0
        && remainingDistanceMm <= ROUTE_COMPLETION_TOLERANCE_MM,
    });
  } finally {
    world.dispose();
  }
}

async function canonicalRegressionAudit(loaded: LoadedRuntimeMapPackage) {
  const world = await createRapierMovementWorld(loaded.authority.fixture);
  try {
    const pressStart = feetPosition([-16_497, 182, -637]);
    const pressTranslation = feetPosition([249, 0, 263]);
    const pressCast = world.castCapsule({
      feetPosition: pressStart,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: pressTranslation,
      contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
      solidLayers: SOLID_LAYERS,
    });
    const pressMove = world.moveCapsule({
      feetPosition: pressStart,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: pressTranslation,
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: SOLID_LAYERS,
    });
    const pressFinal = Object.freeze({
      x: asMillimeters(pressStart.x + pressMove.appliedTranslation.x),
      y: asMillimeters(pressStart.y + pressMove.appliedTranslation.y),
      z: asMillimeters(pressStart.z + pressMove.appliedTranslation.z),
    });
    const pressOverlap = world.overlapCapsule({
      feetPosition: pressFinal,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });

    const archiveStart = feetPosition([-24_024, 37, 424]);
    const archiveTranslation = feetPosition([145, 0, -39]);
    const archiveMove = world.moveCapsule({
      feetPosition: archiveStart,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: archiveTranslation,
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: SOLID_LAYERS,
    });
    const archiveFinal = Object.freeze({
      x: asMillimeters(archiveStart.x + archiveMove.appliedTranslation.x),
      y: asMillimeters(archiveStart.y + archiveMove.appliedTranslation.y),
      z: asMillimeters(archiveStart.z + archiveMove.appliedTranslation.z),
    });
    const archiveOverlap = world.overlapCapsule({
      feetPosition: archiveFinal,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });

    return Object.freeze({
      pressJunction: Object.freeze({
        castClear: pressCast.hit === null,
        appliedTranslationMm: pressMove.appliedTranslation,
        finalFeetMm: pressFinal,
        finalBlockingColliderIds: pressOverlap.blockingColliderIds,
        passed: pressCast.hit === null && pressOverlap.blockingColliderIds.length === 0,
      }),
      westArchive: Object.freeze({
        appliedTranslationMm: archiveMove.appliedTranslation,
        finalFeetMm: archiveFinal,
        finalBlockingColliderIds: archiveOverlap.blockingColliderIds,
        passed: archiveMove.appliedTranslation.x > 0
          && archiveOverlap.blockingColliderIds.length === 0,
      }),
    });
  } finally {
    world.dispose();
  }
}

async function spawnAndVolumeAudit(loaded: LoadedRuntimeMapPackage) {
  const world = await createRapierMovementWorld(loaded.authority.fixture);
  try {
    const spawns = loaded.manifest.spawns.map((spawn) => {
      const overlap = world.overlapCapsule({
        feetPosition: Object.freeze({
          x: asMillimeters(spawn.feetPositionMm.x),
          y: asMillimeters(spawn.feetPositionMm.y),
          z: asMillimeters(spawn.feetPositionMm.z),
        }),
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      });
      const knownEscapeFamilies = spawn.escapeRouteFamilies.every((family) => (
        loaded.manifest.zones.some((zone) => zone.family === family)
      ));
      return Object.freeze({
        id: spawn.id,
        set: spawn.set,
        feetPositionMm: spawn.feetPositionMm,
        blockingColliderIds: overlap.blockingColliderIds,
        escapeRouteFamilies: spawn.escapeRouteFamilies,
        knownEscapeFamilies,
        passed: overlap.blockingColliderIds.length === 0
          && spawn.escapeRouteFamilies.length >= 2
          && knownEscapeFamilies,
      });
    });
    const recovery = world.volumesAtCapsule({
      feetPosition: feetPosition([0, -4_000, 0]),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
    });
    const kill = world.volumesAtCapsule({
      feetPosition: feetPosition([0, -5_000, 0]),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
    });
    return Object.freeze({
      spawns: Object.freeze(spawns),
      allSpawnsClear: spawns.every(({ passed }) => passed),
      volumes: Object.freeze({
        recoveryProbe: recovery,
        killProbe: kill,
        passed: recovery.volumes.some(({ kind }) => kind === 'recovery')
          && kill.volumes.some(({ kind }) => kind === 'kill'),
      }),
    });
  } finally {
    world.dispose();
  }
}

export async function runInkfallRev3ReviewAudit(loaded: LoadedRuntimeMapPackage) {
  const routes = await Promise.all(
    INKFALL_REV3_ROUTE_DEFINITIONS.map((definition) => routeAudit(loaded, definition)),
  );
  const sightlines = sightlineAudit(loaded);
  const canonicalRegression = await canonicalRegressionAudit(loaded);
  const spawnAndVolumes = await spawnAndVolumeAudit(loaded);
  const verticalLevelsMm = Object.freeze(
    [...new Set(loaded.manifest.spawns.map(({ feetPositionMm }) => feetPositionMm.y))]
      .sort((left, right) => left - right),
  );
  const routeFamilies = Object.freeze(
    [...new Set(loaded.manifest.zones.map(({ family }) => family))].sort(),
  );
  const allChecksPassed = routes.every(({ passed }) => passed)
    && sightlines.every(({ passed }) => passed)
    && canonicalRegression.pressJunction.passed
    && canonicalRegression.westArchive.passed
    && spawnAndVolumes.allSpawnsClear
    && spawnAndVolumes.volumes.passed
    && loaded.manifest.zones.length === 9
    && loaded.manifest.supportedModes.every((mode) => (
      mode === 'deathmatch' || mode === 'team_deathmatch'
    ))
    && verticalLevelsMm.length === 3;

  return Object.freeze({
    schemaVersion: 1 as const,
    status: allChecksPassed
      ? 'REV3_PRODUCT_BROWSER_AUTOMATED_AUDIT_PASS_G5_OPEN' as const
      : 'REV3_PRODUCT_BROWSER_AUTOMATED_AUDIT_FAIL_G5_OPEN' as const,
    identity: Object.freeze({
      mapId: loaded.identity.id,
      mapRevision: loaded.identity.revision,
      packageDigest: loaded.identity.packageDigest,
      fixtureHash: loaded.authority.fixtureHash,
      collisionSha256: loaded.authority.collisionSha256,
      renderSha256: loaded.presentation.renderSha256,
      colliderCount: loaded.authority.fixture.solids.length,
    }),
    routes: Object.freeze(routes),
    sightlines,
    canonicalRegression,
    spawnAndVolumes,
    zonesAndObjectives: Object.freeze({
      zoneCount: loaded.manifest.zones.length,
      zoneFamilies: routeFamilies,
      supportedModes: loaded.manifest.supportedModes,
      objectiveContract: 'FRAG_MODES_NO_STATIC_OBJECTIVE_REQUIRED' as const,
      pickupCount: loaded.manifest.pickups.length,
      teleportContracts: Object.freeze(loaded.manifest.triggers.map((trigger) => Object.freeze({
        id: trigger.id,
        implementationStatus: trigger.implementationStatus,
      }))),
      passed: loaded.manifest.zones.length === 9
        && loaded.manifest.pickups.length === 0
        && loaded.manifest.triggers.every(({ implementationStatus }) => (
          implementationStatus === 'contract_only'
        )),
    }),
    navigationAndVerticality: Object.freeze({
      spawnHeightLevelsMm: verticalLevelsMm,
      verticalRangeMm: verticalLevelsMm.at(-1)! - verticalLevelsMm[0],
      routeFamilies,
      routeCount: routes.length,
      routePassCount: routes.filter(({ passed }) => passed).length,
      canonicalRegressionPassCount: [
        canonicalRegression.pressJunction,
        canonicalRegression.westArchive,
      ].filter(({ passed }) => passed).length,
      passed: verticalLevelsMm.length === 3 && routes.every(({ passed }) => passed),
    }),
    allChecksPassed,
    nonClaims: Object.freeze([
      'AUTOMATED_PRODUCT_BROWSER_AUDIT_NOT_HUMAN_PLAYTEST',
      'TELEPORT_TRIGGER_REMAINS_CONTRACT_ONLY',
      'SPAWN_SCORING_NOT_COMPLETE',
      'REVISION_3_NOT_DEFAULT',
      'REVISION_3_NOT_PROMOTED',
      'G5_NOT_PASSED',
    ] as const),
  });
}
