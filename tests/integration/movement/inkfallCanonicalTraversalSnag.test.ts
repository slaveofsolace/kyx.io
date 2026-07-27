import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  convertAuthorityCollisionGlbToFixture,
  createRapierMovementWorld,
  type PhysicsFixtureV1,
} from '../../../src/physics';
import {
  loadRuntimeMapPackageManifest,
  type RuntimeMapPackageManifestV1,
} from '../../../src/content/maps';
import {
  asEntityId,
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  stepMovementSimulation,
  type MovementSimulationState,
  type PlayerIntentCommand,
} from '../../../src/sim';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  type Vector3Millimeters,
} from '../../../src/sim/movement';

interface InkfallCombatFixtureSnapshot {
  readonly fixture: PhysicsFixtureV1;
}

const fixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
  import.meta.url,
);
const revision3ManifestUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/map.package.v3.json',
  import.meta.url,
);
const revision3CollisionUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  import.meta.url,
);
const revision3FixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  import.meta.url,
);

const SOLID_LAYERS = [
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const;

const STUCK_FEET_POSITION = Object.freeze({
  x: asMillimeters(-16_497),
  y: asMillimeters(182),
  z: asMillimeters(-637),
});
const TARGET_FEET_POSITION = Object.freeze({ x: -14_000, y: 0, z: 2_000 });
const OFFENDING_RAIL_ID = 'map_collision_guard_rail_press_west_ink_s00_left';
const OPEN_MID_BAFFLE_IDS = Object.freeze([
  'map_collision_module_press_baffle_e_inner',
  'map_collision_module_press_baffle_w_inner',
] as const);
const RUNTIME_V45_OFFENDING_ROUTE_ID = 'map_collision_route_west_choice_archive_s00';
const RUNTIME_V45_FEET_POSITION = Object.freeze({
  x: asMillimeters(-24_024),
  y: asMillimeters(37),
  z: asMillimeters(424),
});
const RUNTIME_V45_AUTHORITY_TRANSLATION = Object.freeze({
  x: asMillimeters(145),
  y: asMillimeters(0),
  z: asMillimeters(-39),
});
const RUNTIME_V45_AUTHORITY_STATE: MovementSimulationState = {
  schemaVersion: 1,
  identity: {
    rulesetId: 'revamped_classic',
    rulesetRevision: 3,
    rulesetHash: 'd5f0418d1d927370',
    movementProfileId: 'phase3_hypothesis_v1',
    movementProfileRevision: 1,
    movementProfileHash: '8ab4ed437a4393c0',
    fixtureId: 'inkfall_foundry_map_collision',
    fixtureHash: 'bf85e42731fd088e',
    physicsAdapterId: 'rapier3d_deterministic_compat',
    physicsAdapterVersion: '0.19.3',
  },
  simulationRateHz: 20,
  tick: asSimulationTick(492),
  player: {
    id: asEntityId('player.runtime-v45'),
    feetPosition: RUNTIME_V45_FEET_POSITION,
    velocity: {
      x: asMillimetersPerSecond(4_830),
      y: asMillimetersPerSecond(0),
      z: asMillimetersPerSecond(-1_294),
    },
    integrationRemainders: {
      positionX: 3,
      positionY: 0,
      positionZ: -12,
      planarAcceleration: 0,
      gravity: 0,
    },
    yawMilliDegrees: asMilliDegrees(105_000),
    pitchMilliDegrees: asMilliDegrees(0),
    lastProcessedSequence: 490,
    ticksSinceAcceptedCommand: 0,
    intent: {
      moveX: asQuantizedAxis(0),
      moveZ: asQuantizedAxis(0),
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
    },
    stance: 'standing',
    locomotion: 'grounded',
    grounded: true,
    support: {
      colliderId: 'map_collision_route_west_spawn_choice_s01',
      layer: 'world_static',
      normalQ15: { x: 0, y: 32_767, z: 0 },
      velocity: {
        x: asMillimetersPerSecond(0),
        y: asMillimetersPerSecond(0),
        z: asMillimetersPerSecond(0),
      },
    },
    coyoteTicksRemaining: 2,
    jumpBufferTicksRemaining: 0,
    slideTicksRemaining: 0,
    slideCooldownTicksRemaining: 0,
    teleportCooldownTicksRemaining: 0,
    standBlocked: false,
    activeVolumes: [],
  },
};
const RUNTIME_V45_NEXT_COMMAND: PlayerIntentCommand = {
  kind: 'player_intent',
  sequence: 491,
  clientTick: asSimulationTick(491),
  moveX: asQuantizedAxis(0),
  moveZ: asQuantizedAxis(0),
  lookYawDeltaMilliDegrees: -1_500,
  lookPitchDeltaMilliDegrees: 0,
  heldButtons: 0,
  pressedButtons: 0,
  releasedButtons: 0,
  selectedSlot: 0,
};

async function loadRevision3Fixture() {
  const manifest = await loadRuntimeMapPackageManifest(
    JSON.parse(await readFile(revision3ManifestUrl, 'utf8')) as RuntimeMapPackageManifestV1,
  );
  const converted = convertAuthorityCollisionGlbToFixture(
    manifest,
    await readFile(revision3CollisionUrl),
  );
  return { manifest, converted };
}

async function probeCapsuleMove(
  fixture: PhysicsFixtureV1,
  feetPosition: Vector3Millimeters = RUNTIME_V45_FEET_POSITION,
  translation: Vector3Millimeters = RUNTIME_V45_AUTHORITY_TRANSLATION,
) {
  const world = await createRapierMovementWorld(fixture);
  try {
    const startingOverlap = world.overlapCapsule({
      feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });
    const forwardCast = world.castCapsule({
      feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation,
      contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
      solidLayers: SOLID_LAYERS,
    });
    const move = world.moveCapsule({
      feetPosition,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: translation,
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: SOLID_LAYERS,
    });
    const finalFeet = {
      x: asMillimeters(feetPosition.x + move.appliedTranslation.x),
      y: asMillimeters(feetPosition.y + move.appliedTranslation.y),
      z: asMillimeters(feetPosition.z + move.appliedTranslation.z),
    };
    const finalOverlap = world.overlapCapsule({
      feetPosition: finalFeet,
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: SOLID_LAYERS,
    });
    return { startingOverlap, forwardCast, move, finalFeet, finalOverlap };
  } finally {
    world.dispose();
  }
}

async function probeRuntimeV45SimulationStep(fixture: PhysicsFixtureV1) {
  const world = await createRapierMovementWorld(fixture);
  try {
    return stepMovementSimulation(
      RUNTIME_V45_AUTHORITY_STATE,
      [RUNTIME_V45_NEXT_COMMAND],
      PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      world,
    );
  } finally {
    world.dispose();
  }
}

describe('Inkfall canonical west press traversal snag', () => {
  it('reproduces the revision-2 shared-junction guard-rail embed at the exact P5.15 pose', async () => {
    const snapshot = JSON.parse(await readFile(fixtureUrl, 'utf8')) as InkfallCombatFixtureSnapshot;
    const world = await createRapierMovementWorld(snapshot.fixture);

    try {
      const overlap = world.overlapCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      });

      expect(overlap.blockingColliderIds).toEqual([]);

      const forwardCast = world.castCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        translation: {
          x: asMillimeters(249),
          y: asMillimeters(0),
          z: asMillimeters(263),
        },
        contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
        solidLayers: SOLID_LAYERS,
      });
      expect(forwardCast).toMatchObject({
        allowedTranslation: { x: 75, y: 0, z: 80 },
        hit: {
          colliderId: OFFENDING_RAIL_ID,
          layer: 'world_static',
          normalQ15: { x: -8_918, y: -4_459, z: -31_213 },
          timeOfImpactPermille: 303,
        },
      });

      expect(() => world.moveCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: {
          x: asMillimeters(249),
          y: asMillimeters(0),
          z: asMillimeters(263),
        },
        settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
        solidLayers: SOLID_LAYERS,
      })).toThrow('PHYSICS_DEPENETRATION_FAILED');
    } finally {
      world.dispose();
    }
  });

  it('clears the exact P5.15 cast and KCC move in the open-mid revision-3 candidate', async () => {
    const { converted } = await loadRevision3Fixture();
    const snapshot = JSON.parse(await readFile(revision3FixtureUrl, 'utf8')) as {
      readonly mapRevision: number;
      readonly packageDigest: string;
      readonly collisionSha256: string;
      readonly fixtureHash: string;
      readonly collisionMeshNodeCount: number;
      readonly fixture: PhysicsFixtureV1;
    };
    expect(snapshot).toMatchObject({
      mapRevision: 3,
      packageDigest: '260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a',
      collisionSha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
      fixtureHash: '6cf785c5171f2ff5',
      collisionMeshNodeCount: 339,
    });
    expect(snapshot.fixture).toEqual(converted.fixture);
    const rail = converted.fixture.solids.find((solid) => (
      solid.id === OFFENDING_RAIL_ID
    ));
    expect(converted.fixtureHash).toBe('6cf785c5171f2ff5');
    expect(converted.collisionMeshNodeCount).toBe(339);
    expect(rail).toMatchObject({
      centerMm: { x: -16_179, y: -68, z: -1_330 },
      shape: { halfExtentsMm: { x: 574, y: 450, z: 80 } },
    });

    const world = await createRapierMovementWorld(converted.fixture);
    try {
      const forwardCast = world.castCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        translation: {
          x: asMillimeters(249),
          y: asMillimeters(0),
          z: asMillimeters(263),
        },
        contactSkin: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query.contactSkin,
        solidLayers: SOLID_LAYERS,
      });
      const move = world.moveCapsule({
        feetPosition: STUCK_FEET_POSITION,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: {
          x: asMillimeters(249),
          y: asMillimeters(0),
          z: asMillimeters(263),
        },
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
      expect(forwardCast.hit).toBeNull();
      expect(finalOverlap.blockingColliderIds).toEqual([]);
      expect(move.appliedTranslation.x).toBeGreaterThan(0);
      expect(move.appliedTranslation.z).toBeGreaterThan(0);
    } finally {
      world.dispose();
    }
  });

  it('changes only the rail repair and paired open-mid baffles while preserving cardinality', async () => {
    const revision2 = JSON.parse(
      await readFile(fixtureUrl, 'utf8'),
    ) as InkfallCombatFixtureSnapshot;
    const { manifest, converted } = await loadRevision3Fixture();
    const changedColliderIds = new Set([OFFENDING_RAIL_ID, ...OPEN_MID_BAFFLE_IDS]);
    const revision2Untouched = revision2.fixture.solids.filter((solid) => (
      !changedColliderIds.has(solid.id)
    ));
    const revision3Untouched = converted.fixture.solids.filter((solid) => (
      !changedColliderIds.has(solid.id)
    ));
    const revision2Rail = revision2.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);
    const revision3Rail = converted.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);

    expect(manifest.identity.digest).toBe(
      '260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a',
    );
    expect(converted.fixtureHash).not.toBe('bf85e42731fd088e');
    expect(converted.fixture.solids).toHaveLength(revision2.fixture.solids.length);
    expect(converted.fixture.volumes).toEqual(revision2.fixture.volumes);
    expect(converted.fixture.spawn).toEqual(revision2.fixture.spawn);
    expect(revision3Untouched).toEqual(revision2Untouched);
    expect(revision2Rail).toMatchObject({
      centerMm: { x: -16_151, y: -54, z: -1_235 },
      shape: { halfExtentsMm: { x: 674, y: 450, z: 80 } },
    });
    expect(revision3Rail).toMatchObject({
      centerMm: { x: -16_179, y: -68, z: -1_330 },
      shape: { halfExtentsMm: { x: 574, y: 450, z: 80 } },
    });
    expect(OPEN_MID_BAFFLE_IDS.map((id) => (
      revision2.fixture.solids.find((solid) => solid.id === id)
    ))).toMatchObject([
      {
        centerMm: { x: 5_200, y: 1_500, z: -4_700 },
        shape: { halfExtentsMm: { x: 2_500, y: 1_500, z: 250 } },
      },
      {
        centerMm: { x: -5_200, y: 1_500, z: -4_700 },
        shape: { halfExtentsMm: { x: 2_500, y: 1_500, z: 250 } },
      },
    ]);
    expect(OPEN_MID_BAFFLE_IDS.map((id) => (
      converted.fixture.solids.find((solid) => solid.id === id)
    ))).toMatchObject([
      {
        centerMm: { x: 6_400, y: 1_500, z: -4_700 },
        shape: { halfExtentsMm: { x: 1_600, y: 1_500, z: 250 } },
      },
      {
        centerMm: { x: -6_400, y: 1_500, z: -4_700 },
        shape: { halfExtentsMm: { x: 1_600, y: 1_500, z: 250 } },
      },
    ]);
  });

  it('traverses the exact remaining leg and adjacent lanes with zero recovery', async () => {
    const { converted } = await loadRevision3Fixture();
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
      const world = await createRapierMovementWorld(converted.fixture);
      let feet = {
        x: asMillimeters(Math.round(STUCK_FEET_POSITION.x + perpendicular.x * laneOffsetMm)),
        y: STUCK_FEET_POSITION.y,
        z: asMillimeters(Math.round(STUCK_FEET_POSITION.z + perpendicular.z * laneOffsetMm)),
      };
      let recoveryCount = 0;
      let railContactCount = 0;
      let minimumDistanceMm = Infinity;
      let recoveryError: string | null = null;
      try {
        for (let stepIndex = 0; stepIndex < 20; stepIndex += 1) {
          const dx = TARGET_FEET_POSITION.x - feet.x;
          const dz = TARGET_FEET_POSITION.z - feet.z;
          const distanceMm = Math.hypot(dx, dz);
          minimumDistanceMm = Math.min(minimumDistanceMm, distanceMm);
          if (distanceMm <= 180) break;
          const stepLengthMm = Math.min(300, distanceMm);
          const desiredTranslation = {
            x: asMillimeters(Math.round(dx * stepLengthMm / distanceMm)),
            y: asMillimeters(0),
            z: asMillimeters(Math.round(dz * stepLengthMm / distanceMm)),
          };
          try {
            const move = world.moveCapsule({
              feetPosition: feet,
              shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
              desiredTranslation,
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
            expect(world.overlapCapsule({
              feetPosition: feet,
              shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
              solidLayers: SOLID_LAYERS,
            }).blockingColliderIds).toEqual([]);
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
        recoveryCount,
        recoveryError,
        railContactCount,
        minimumDistanceMm,
      });
    }

    for (const trajectory of trajectories) {
      expect(trajectory.recoveryCount).toBe(0);
      expect(trajectory.recoveryError).toBeNull();
      expect(trajectory.minimumDistanceMm).toBeLessThan(100);
    }
    expect(trajectories.map((trajectory) => trajectory.railContactCount)).toEqual([
      2,
      2,
      1,
      0,
      0,
      0,
      0,
    ]);
  });

  it('reconciles the exact runtime-v45 west-archive face rounding and advances authority', async () => {
    const revision2 = JSON.parse(
      await readFile(fixtureUrl, 'utf8'),
    ) as InkfallCombatFixtureSnapshot;
    const revision3 = JSON.parse(await readFile(revision3FixtureUrl, 'utf8')) as {
      readonly fixture: PhysicsFixtureV1;
    };
    const directRevision2 = await probeCapsuleMove(revision2.fixture);
    const directRevision3 = await probeCapsuleMove(revision3.fixture);

    expect(directRevision3.startingOverlap.blockingColliderIds).toEqual([]);
    expect(directRevision3.forwardCast).toMatchObject({
      allowedTranslation: { x: 39, y: 0, z: -10 },
      hit: {
        colliderId: RUNTIME_V45_OFFENDING_ROUTE_ID,
        layer: 'world_static',
        normalQ15: { x: -12_484, y: 8_323, z: 29_130 },
        timeOfImpactPermille: 266,
      },
    });
    expect(directRevision3.move).toMatchObject({
      appliedTranslation: { x: 66, y: 0, z: -22 },
      grounded: true,
      hitCeiling: false,
      support: {
        colliderId: 'map_collision_node_west_choice',
        layer: 'world_static',
        normalQ15: { x: 0, y: 32_767, z: 0 },
      },
      contacts: [
        {
          colliderId: RUNTIME_V45_OFFENDING_ROUTE_ID,
          normalQ15: { x: -30_118, y: 0, z: -12_908 },
          timeOfImpactPermille: 266,
        },
        {
          colliderId: RUNTIME_V45_OFFENDING_ROUTE_ID,
          normalQ15: { x: -26_461, y: 0, z: -19_326 },
          timeOfImpactPermille: 499,
        },
      ],
    });
    expect(directRevision3.finalFeet).toEqual({
      x: -23_958,
      y: 37,
      z: 402,
    });
    expect(directRevision3.finalOverlap.blockingColliderIds).toEqual([]);
    expect(directRevision2).toEqual(directRevision3);

    const simulationRevision2 = await probeRuntimeV45SimulationStep(revision2.fixture);
    const simulationRevision3 = await probeRuntimeV45SimulationStep(revision3.fixture);
    expect(simulationRevision3.state).toMatchObject({
      tick: 493,
      player: {
        feetPosition: { x: -23_958, y: 37, z: 402 },
        velocity: { x: 731, y: 0, z: -1_705 },
        yawMilliDegrees: 103_500,
        lastProcessedSequence: 491,
        grounded: true,
        support: {
          colliderId: 'map_collision_node_west_choice',
          normalQ15: { x: 0, y: 32_767, z: 0 },
        },
      },
    });
    expect(simulationRevision3.metrics).toMatchObject({
      moveCapsuleCalls: 1,
      volumeCalls: 1,
    });
    expect(simulationRevision3.metrics.overlapTests).toBeGreaterThan(1);
    expect(simulationRevision2).toEqual(simulationRevision3);
  });
});
