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
import { asMillimeters } from '../../../src/sim';
import {
  stepMovementSimulation,
  type MovementSimulationState,
  type PlayerIntentCommand,
} from '../../../src/sim';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../src/sim/movement';

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
const RUNTIME_V45_OFFENDING_ROUTE_ID = 'map_collision_route_west_choice_archive_s00';
const RUNTIME_V45_FEET_POSITION = Object.freeze({ x: -24_024, y: 37, z: 424 });
const RUNTIME_V45_FORWARD_TRANSLATION = Object.freeze({ x: 318, y: 0, z: -67 });
const RUNTIME_V45_AUTHORITY_STATE = {
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
  tick: 492,
  player: {
    id: 'player.runtime-v45',
    feetPosition: { x: -24_024, y: 37, z: 424 },
    velocity: { x: 4_830, y: 0, z: -1_294 },
    integrationRemainders: {
      positionX: 3,
      positionY: 0,
      positionZ: -12,
      planarAcceleration: 0,
      gravity: 0,
    },
    yawMilliDegrees: 105_000,
    pitchMilliDegrees: 0,
    lastProcessedSequence: 490,
    ticksSinceAcceptedCommand: 0,
    intent: {
      moveX: 0,
      moveZ: 0,
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
      velocity: { x: 0, y: 0, z: 0 },
    },
    coyoteTicksRemaining: 2,
    jumpBufferTicksRemaining: 0,
    slideTicksRemaining: 0,
    slideCooldownTicksRemaining: 0,
    teleportCooldownTicksRemaining: 0,
    standBlocked: false,
    activeVolumes: [],
  },
} as unknown as MovementSimulationState;
const RUNTIME_V45_NEXT_COMMAND = {
  kind: 'player_intent',
  sequence: 491,
  clientTick: 491,
  moveX: 0,
  moveZ: 0,
  lookYawDeltaMilliDegrees: -1_500,
  lookPitchDeltaMilliDegrees: 0,
  heldButtons: 0,
  pressedButtons: 0,
  releasedButtons: 0,
  selectedSlot: 0,
} as unknown as PlayerIntentCommand;

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
  feetPosition = RUNTIME_V45_FEET_POSITION,
  translation = RUNTIME_V45_FORWARD_TRANSLATION,
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
    try {
      const move = world.moveCapsule({
        feetPosition,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: translation,
        settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
        solidLayers: SOLID_LAYERS,
      });
      return { startingOverlap, forwardCast, outcome: 'PASS' as const, move };
    } catch (error) {
      return {
        startingOverlap,
        forwardCast,
        outcome: 'ERROR' as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } finally {
    world.dispose();
  }
}

async function probeRuntimeV45SimulationStep(fixture: PhysicsFixtureV1) {
  const world = await createRapierMovementWorld(fixture);
  try {
    try {
      const result = stepMovementSimulation(
        RUNTIME_V45_AUTHORITY_STATE,
        [RUNTIME_V45_NEXT_COMMAND],
        PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
        world,
      );
      return { outcome: 'PASS' as const, state: result.state, queries: result.queries };
    } catch (error) {
      return {
        outcome: 'ERROR' as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

  it('clears the exact P5.15 cast and KCC move in the one-rail revision-3 candidate', async () => {
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
      packageDigest: 'c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161',
      collisionSha256: '5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca',
      fixtureHash: '31fea7ee73a12b91',
      collisionMeshNodeCount: 339,
    });
    expect(snapshot.fixture).toEqual(converted.fixture);
    const rail = converted.fixture.solids.find((solid) => (
      solid.id === OFFENDING_RAIL_ID
    ));
    expect(converted.fixtureHash).toBe('31fea7ee73a12b91');
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

  it('changes only the intended rail while preserving revision-2 authority cardinality', async () => {
    const revision2 = JSON.parse(
      await readFile(fixtureUrl, 'utf8'),
    ) as InkfallCombatFixtureSnapshot;
    const { manifest, converted } = await loadRevision3Fixture();
    const revision2Untouched = revision2.fixture.solids.filter((solid) => (
      solid.id !== OFFENDING_RAIL_ID
    ));
    const revision3Untouched = converted.fixture.solids.filter((solid) => (
      solid.id !== OFFENDING_RAIL_ID
    ));
    const revision2Rail = revision2.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);
    const revision3Rail = converted.fixture.solids.find((solid) => solid.id === OFFENDING_RAIL_ID);

    expect(manifest.identity.digest).toBe(
      'c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161',
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

  it('probes the runtime-v45 reachable press-core pose in revisions 2 and 3', async () => {
    const revision2 = JSON.parse(
      await readFile(fixtureUrl, 'utf8'),
    ) as InkfallCombatFixtureSnapshot;
    const revision3 = JSON.parse(await readFile(revision3FixtureUrl, 'utf8')) as {
      readonly fixture: PhysicsFixtureV1;
    };
    const translations = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: -50, z: 0 },
      { x: 0, y: -100, z: 0 },
      { x: 145, y: 0, z: -39 },
      { x: 145, y: -50, z: -39 },
      RUNTIME_V45_FORWARD_TRANSLATION,
      { x: 318, y: -50, z: -67 },
      { x: 338, y: 0, z: -91 },
      { x: 338, y: -50, z: -91 },
      { x: 338, y: -100, z: -91 },
    ];
    const probes = {
      revision2: await Promise.all(translations.map((translation) => (
        probeCapsuleMove(revision2.fixture, RUNTIME_V45_FEET_POSITION, translation)
      ))),
      revision3: await Promise.all(translations.map((translation) => (
        probeCapsuleMove(revision3.fixture, RUNTIME_V45_FEET_POSITION, translation)
      ))),
      simulationStep: {
        revision2: await probeRuntimeV45SimulationStep(revision2.fixture),
        revision3: await probeRuntimeV45SimulationStep(revision3.fixture),
      },
    };
    const isolationIds = [
      'map_collision_node_west_choice',
      'map_collision_route_west_spawn_choice_s01',
      'map_collision_route_west_choice_archive_s00',
    ];
    const isolation = Object.fromEntries(await Promise.all(isolationIds.map(async (removedId) => {
      const fixture = {
        ...revision3.fixture,
        solids: revision3.fixture.solids.filter(({ id }) => id !== removedId),
      };
      return [removedId, {
        direct: await probeCapsuleMove(
          fixture,
          RUNTIME_V45_FEET_POSITION,
          { x: 145, y: 0, z: -39 },
        ),
        simulation: await probeRuntimeV45SimulationStep(fixture),
      }];
    })));
    const routeDirectionLength = Math.hypot(-3_000, 2_000, 7_000);
    const trims = [
      1_000, 1_100, 1_200, 1_300, 1_400, 1_500, 1_600, 1_700, 1_800,
      1_900, 2_000, 2_100, 2_200, 2_400, 2_600, 2_800, 3_000,
    ];
    const trimTrials = Object.fromEntries(await Promise.all(trims.map(async (trimmedStartMm) => {
      const fixture = {
        ...revision3.fixture,
        solids: revision3.fixture.solids.map((solid) => {
          if (solid.id !== RUNTIME_V45_OFFENDING_ROUTE_ID || solid.shape.type !== 'box') {
            return solid;
          }
          return {
            ...solid,
            centerMm: {
              x: asMillimeters(Math.round(solid.centerMm.x
                + (-3_000 / routeDirectionLength) * trimmedStartMm / 2)),
              y: asMillimeters(Math.round(solid.centerMm.y
                + (2_000 / routeDirectionLength) * trimmedStartMm / 2)),
              z: asMillimeters(Math.round(solid.centerMm.z
                + (7_000 / routeDirectionLength) * trimmedStartMm / 2)),
            },
            shape: {
              ...solid.shape,
              halfExtentsMm: {
                ...solid.shape.halfExtentsMm,
                x: asMillimeters(solid.shape.halfExtentsMm.x - trimmedStartMm / 2),
              },
            },
          };
        }),
      };
      return [trimmedStartMm, {
        direct: await probeCapsuleMove(
          fixture,
          RUNTIME_V45_FEET_POSITION,
          { x: 145, y: 0, z: -39 },
        ),
        simulation: await probeRuntimeV45SimulationStep(fixture),
      }];
    })));
    console.log(`RUNTIME_V45_COLLISION_PROBE=${JSON.stringify(probes)}`);
    console.log(`RUNTIME_V45_COLLIDER_ISOLATION=${JSON.stringify(isolation)}`);
    console.log(`RUNTIME_V45_ROUTE_TRIM_TRIALS=${JSON.stringify(trimTrials)}`);
    expect(probes.revision2.every(({ outcome }) => outcome !== undefined)).toBe(true);
    expect(probes.revision3.every(({ outcome }) => outcome !== undefined)).toBe(true);
    expect(probes.simulationStep.revision2.outcome).toBeDefined();
    expect(probes.simulationStep.revision3.outcome).toBeDefined();
    expect(Object.keys(isolation)).toEqual(isolationIds);
    expect(Object.keys(trimTrials)).toHaveLength(trims.length);
  });
});
