import { readFile } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
} from '../../../src/sim/movement/profile';
import type {
  MovementCollisionLayer,
  MovementQuerySettings,
  Vector3Millimeters,
} from '../../../src/sim/movement/queryPort';
import { asMilliDegrees, asMillimeters } from '../../../src/sim/units';
import {
  EXPECTED_RAPIER_VERSION,
  RAPIER_INIT_DIAGNOSTIC,
  createRapierMovementWorld,
  initializeRapierRuntime,
  type RapierMovementWorld,
} from '../../../src/physics/rapier';
import { getPhysicsFixture } from '../../../src/physics/fixtures';
import { boxSolid, boxVolume, fixture } from '../../../src/physics/fixtures/primitives';

const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const satisfies readonly MovementCollisionLayer[]);

function position(x: number, y: number, z: number): Vector3Millimeters {
  return Object.freeze({ x: asMillimeters(x), y: asMillimeters(y), z: asMillimeters(z) });
}

const worlds: RapierMovementWorld[] = [];

async function createWorld(id: Parameters<typeof getPhysicsFixture>[0]): Promise<RapierMovementWorld> {
  const world = await createRapierMovementWorld(getPhysicsFixture(id));
  worlds.push(world);
  return world;
}

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('Rapier runtime boundary', () => {
  it('pins the exact direct deterministic compatibility package version', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies['@dimforge/rapier3d-deterministic-compat']).toBe('0.19.3');
    const runtime = await initializeRapierRuntime();
    expect(runtime.version).toBe(EXPECTED_RAPIER_VERSION);
    expect(runtime.initializationDiagnostic).toEqual(RAPIER_INIT_DIAGNOSTIC);
    expect(runtime.initializationDiagnostic.handling).toBe('exposed_by_upstream_not_suppressed');
  });

  it('creates and explicitly disposes a fixture world', async () => {
    const world = await createWorld('flat_run');
    expect(world.fixture.id).toBe('flat_run');
    expect(world.fixtureHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(world.disposed).toBe(false);
    world.dispose();
    world.dispose();
    expect(world.disposed).toBe(true);
    expect(() => world.overlapCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['world_static'],
    })).toThrow('PHYSICS_WORLD_DISPOSED');
  });
});

describe('Rapier movement queries', () => {
  it('uses 1000 mm per Rapier unit and preserves unobstructed integer movement', async () => {
    const world = await createWorld('flat_run');
    const result = world.moveCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(1_000, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(result.appliedTranslation).toEqual(position(1_000, 0, 0));
    expect(result.grounded).toBe(true);
    expect(result.support?.colliderId).toBe('flat_ground');
    expect(result.shapeCasts).toBe(1);
  });

  it('stops downward motion at skin distance and reports stable support', async () => {
    const world = await createWorld('flat_run');
    const result = world.moveCapsule({
      feetPosition: position(0, 100, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, -200, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(result.appliedTranslation.x).toBe(0);
    expect(result.appliedTranslation.y).toBeGreaterThanOrEqual(-100);
    expect(result.appliedTranslation.y).toBeLessThan(0);
    expect(result.grounded).toBe(true);
    expect(result.support?.colliderId).toBe('flat_ground');
    expect(result.support?.normalQ15.y).toBe(32_767);
  });

  it('climbs the 340 mm step and blocks on the 360 mm threshold fixture', async () => {
    const world = await createWorld('vertical_lab');
    const belowThreshold = world.moveCapsule({
      feetPosition: position(-3_500, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(1_500, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(belowThreshold.appliedTranslation.x).toBe(1_500);
    expect(belowThreshold.appliedTranslation.y).toBeGreaterThanOrEqual(340);
    expect(belowThreshold.support?.colliderId).toBe('step_below_threshold');

    const aboveThreshold = world.moveCapsule({
      feetPosition: position(-1_000, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(1_000, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(aboveThreshold.appliedTranslation.x).toBeLessThan(200);
    expect(aboveThreshold.appliedTranslation.y).toBe(0);
    expect(aboveThreshold.contacts.map((contact) => contact.colliderId)).toContain(
      'step_above_threshold',
    );
  });

  it('distinguishes exact floor contact from a one-millimeter overlap', async () => {
    const world = await createWorld('flat_run');
    const touching = world.overlapCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['world_static'],
    });
    const embedded = world.overlapCapsule({
      feetPosition: position(0, -1, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['world_static'],
    });
    expect(touching.blockingColliderIds).toEqual([]);
    expect(embedded.blockingColliderIds).toEqual(['flat_ground']);
  });

  it('keeps canonical feet height and face normals stable for 120 flat-floor moves', async () => {
    const world = await createWorld('flat_run');
    let feet = position(0, 0, 0);
    for (let index = 0; index < 120; index += 1) {
      const direction = Math.floor(index / 10) % 2 === 0 ? 1 : -1;
      const result = world.moveCapsule({
        feetPosition: feet,
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        desiredTranslation: position(0, 0, direction * 200),
        settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
        solidLayers: ['world_static'],
      });
      expect(result.appliedTranslation.y).toBe(0);
      expect(result.support?.normalQ15).toEqual({ x: 0, y: 32_767, z: 0 });
      for (const contact of result.contacts) {
        if (contact.colliderId === 'flat_ground') {
          expect(contact.normalQ15).toEqual({ x: 0, y: 32_767, z: 0 });
        }
      }
      feet = position(
        feet.x + result.appliedTranslation.x,
        feet.y + result.appliedTranslation.y,
        feet.z + result.appliedTranslation.z,
      );
      expect(feet.y).toBe(0);
    }
  });

  it('casts the full capsule against the thin wall without floor interference', async () => {
    const world = await createWorld('teleport_lab');
    const result = world.castCapsule({
      feetPosition: position(-3_000, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(6_000, 0, 0),
      contactSkin: asMillimeters(20),
      solidLayers: ['world_static'],
    });
    expect(result.hit?.colliderId).toBe('thin_wall');
    expect(result.hit?.normalQ15.x).toBe(-32_767);
    expect(result.allowedTranslation.x).toBeGreaterThan(2_500);
    expect(result.allowedTranslation.x).toBeLessThan(2_700);
    expect(result.hit?.timeOfImpactPermille).toBeGreaterThan(400);
    expect(result.hit?.timeOfImpactPermille).toBeLessThan(500);
  });

  it('casts solid rays with nearest-distance and collider-ID deterministic ordering', async () => {
    const ordered = fixture(
      'solid_ray_order_a',
      [0, 0, 0],
      [
        boxSolid('z_wall', 'world_static', [0, 1_000, 0], [250, 1_000, 1_000]),
        boxSolid('a_wall', 'world_static', [0, 1_000, 0], [250, 1_000, 1_000]),
      ],
      [boxVolume('far_recovery', 'recovery', [10_000, 0, 10_000], [100, 100, 100])],
    );
    const reversed = fixture(
      'solid_ray_order_b',
      [0, 0, 0],
      [...ordered.solids].reverse(),
      ordered.volumes,
    );
    const left = await createRapierMovementWorld(ordered);
    const right = await createRapierMovementWorld(reversed);
    worlds.push(left, right);
    const request = Object.freeze({
      originMillimeters: Object.freeze({ x: -3_000, y: 1_000, z: 0 }),
      directionUnit: Object.freeze({ x: 1, y: 0, z: 0 }),
      maximumDistanceMillimeters: 10_000,
      solidLayers: Object.freeze(['world_static'] as const),
      solid: true,
    });

    expect(left.castSolidRay(request)).toEqual({
      hit: {
        colliderId: 'a_wall',
        layer: 'world_static',
        distanceMillimeters: 2_750,
      },
      rayCasts: 2,
    });
    expect(right.castSolidRay(request)).toEqual(left.castSolidRay(request));
    expect(() => left.castSolidRay({
      ...request,
      directionUnit: { x: 2, y: 0, z: 0 },
    })).toThrow(/unit length/u);
    expect(() => left.castSolidRay({
      ...request,
      originMillimeters: { x: Number.NaN, y: 0, z: 0 },
    })).toThrow(/finite/u);
    expect(() => left.castSolidRay({
      ...request,
      maximumDistanceMillimeters: 0,
    })).toThrow(/integer from 1/u);
  });

  it('ignores exact floor and wall tangency plus motion away from a touching wall', async () => {
    const flatWorld = await createWorld('flat_run');
    const parallelToFloor = flatWorld.castCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(2_000, 0, 0),
      contactSkin: asMillimeters(20),
      solidLayers: ['world_static'],
    });
    expect(parallelToFloor).toEqual({
      allowedTranslation: position(2_000, 0, 0),
      hit: null,
      shapeCasts: 1,
    });

    const teleportWorld = await createWorld('teleport_lab');
    const tangentToWall = teleportWorld.castCapsule({
      feetPosition: position(-375, 0, -1_000),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(0, 0, 2_000),
      contactSkin: asMillimeters(0),
      solidLayers: ['world_static'],
    });
    expect(tangentToWall.hit).toBeNull();
    expect(tangentToWall.allowedTranslation).toEqual(position(0, 0, 2_000));
    expect(tangentToWall.shapeCasts).toBe(5);

    const awayFromWall = teleportWorld.castCapsule({
      feetPosition: position(-375, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(-1_000, 0, 0),
      contactSkin: asMillimeters(0),
      solidLayers: ['world_static'],
    });
    expect(awayFromWall.hit).toBeNull();
    expect(awayFromWall.allowedTranslation).toEqual(position(-1_000, 0, 0));
    expect(awayFromWall.shapeCasts).toBe(5);
  });

  it('honors layer filters for casts and overlaps', async () => {
    const world = await createWorld('teleport_lab');
    const ignoredWall = world.castCapsule({
      feetPosition: position(-3_000, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(6_000, 0, 0),
      contactSkin: asMillimeters(20),
      solidLayers: ['door'],
    });
    expect(ignoredWall.hit).toBeNull();
    expect(ignoredWall.allowedTranslation).toEqual(position(6_000, 0, 0));

    const proxy = world.overlapCapsule({
      feetPosition: position(3_000, 0, -1_500),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['player_body'],
    });
    expect(proxy.blockingColliderIds).toEqual(['teleport_player_proxy']);
  });

  it('reports ceiling contact using a full standing capsule', async () => {
    const world = await createWorld('vertical_lab');
    const result = world.moveCapsule({
      feetPosition: position(-4_000, 0, 4_500),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 1_000, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(result.hitCeiling).toBe(true);
    expect(result.appliedTranslation.y).toBeGreaterThan(400);
    expect(result.appliedTranslation.y).toBeLessThan(600);
  });

  it('reports an exact-endpoint 500 mm ceiling clip even when Rapier omits its normal', async () => {
    const world = await createWorld('vertical_lab');
    const result = world.moveCapsule({
      feetPosition: position(-4_000, 0, 4_500),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 500, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(result.hitCeiling).toBe(true);
    expect(result.appliedTranslation.y).toBeGreaterThan(400);
    expect(result.appliedTranslation.y).toBeLessThan(500);
    expect(result.contacts.length).toBeGreaterThan(0);
  });

  it('does not mislabel diagonal upward wall sliding as a ceiling hit', async () => {
    const world = await createWorld('contact_lab');
    const result = world.moveCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(4_000, 500, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(result.appliedTranslation.x).toBeLessThan(3_000);
    expect(result.appliedTranslation.y).toBeGreaterThanOrEqual(498);
    expect(result.hitCeiling).toBe(false);
    expect(result.contacts.map((contact) => contact.colliderId)).toContain('wall_axis');
  });

  it('returns dynamic-platform support velocity as integer DTO data', async () => {
    const world = await createWorld('contact_lab');
    const result = world.moveCapsule({
      feetPosition: position(0, 1_000, -5_000),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static', 'dynamic_platform'],
    });
    expect(result.grounded).toBe(true);
    expect(result.support).toMatchObject({
      colliderId: 'moving_platform_probe',
      layer: 'dynamic_platform',
      velocity: { x: 500, y: 0, z: 0 },
    });
  });

  it('accepts authored 45-degree support and rejects 50-degree support', async () => {
    const world = await createWorld('vertical_lab');
    const walkable = world.moveCapsule({
      feetPosition: position(2_902, 1_225, -2_500),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(walkable.grounded).toBe(true);
    expect(walkable.support?.colliderId).toBe('ramp_walkable');
    expect(walkable.support?.normalQ15.y).toBeGreaterThanOrEqual(23_100);

    const tooSteep = world.moveCapsule({
      feetPosition: position(6_489, 1_569, -2_500),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    });
    expect(tooSteep.grounded).toBe(false);
    expect(tooSteep.support).toBeNull();
  });

  it('depenetrates in stable collider-ID order without launching the capsule', async () => {
    const ordered = fixture(
      'depenetration_order_a',
      [0, 0, 0],
      [
        boxSolid('probe_ground', 'world_static', [0, -500, 0], [3_000, 500, 3_000]),
        boxSolid('z_probe', 'world_static', [0, 1_000, 600], [1_000, 1_000, 300]),
        boxSolid('a_probe', 'world_static', [600, 1_000, 0], [300, 1_000, 1_000]),
      ],
      [boxVolume('far_recovery', 'recovery', [-2_500, 500, -2_500], [100, 500, 100])],
    );
    const reversed = fixture(
      'depenetration_order_b',
      [0, 0, 0],
      [...ordered.solids].reverse(),
      ordered.volumes,
    );
    const left = await createRapierMovementWorld(ordered);
    const right = await createRapierMovementWorld(reversed);
    worlds.push(left, right);
    const request = {
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'] as const,
    };
    const result = left.moveCapsule(request);
    expect(right.moveCapsule(request)).toEqual(result);
    expect(result.appliedTranslation.x).toBeLessThan(0);
    expect(result.appliedTranslation.z).toBeLessThan(0);
    expect(result.appliedTranslation.y).toBe(0);
    expect(Math.hypot(
      result.appliedTranslation.x,
      result.appliedTranslation.y,
      result.appliedTranslation.z,
    )).toBeLessThan(100);
    expect(result.contacts.map((contact) => contact.colliderId)).toEqual(['a_probe', 'z_probe']);
    expect(left.overlapCapsule({
      feetPosition: position(
        result.appliedTranslation.x,
        result.appliedTranslation.y,
        result.appliedTranslation.z,
      ),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['world_static'],
    }).blockingColliderIds).toEqual([]);
  });

  it('fails closed when bounded depenetration cannot escape an enclosure', async () => {
    const source = fixture(
      'depenetration_failure_probe',
      [0, 0, 0],
      [boxSolid('enclosure', 'world_static', [0, 900, 0], [6_000, 6_000, 6_000])],
      [boxVolume('far_recovery', 'recovery', [8_000, 500, 8_000], [100, 500, 100])],
    );
    const world = await createRapierMovementWorld(source);
    worlds.push(world);
    expect(() => world.moveCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      settings: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      solidLayers: ['world_static'],
    })).toThrow('PHYSICS_DEPENETRATION_FAILED');
  });

  it('reports volume hits in stable collider-ID order', async () => {
    const source = fixture(
      'volume_order_probe',
      [0, 0, 0],
      [boxSolid('probe_ground', 'world_static', [0, -500, 0], [2_000, 500, 2_000])],
      [
        boxVolume('z_recovery', 'recovery', [0, 900, 0], [1_000, 900, 1_000]),
        boxVolume('a_kill', 'kill', [0, 900, 0], [1_000, 900, 1_000]),
      ],
    );
    const world = await createRapierMovementWorld(source);
    worlds.push(world);
    expect(world.volumesAtCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
    })).toEqual({
      volumes: [
        { colliderId: 'a_kill', kind: 'kill' },
        { colliderId: 'z_recovery', kind: 'recovery' },
      ],
      overlapTests: 1,
    });
  });

  it('sorts and bounds contacts independent of Rapier callback order', async () => {
    const source = fixture(
      'contact_order_probe',
      [0, 0, 0],
      [
        boxSolid('probe_ground', 'world_static', [0, -500, 0], [3_000, 500, 3_000]),
        boxSolid('z_wall', 'world_static', [1_000, 1_000, 0], [100, 1_000, 2_000]),
        boxSolid('a_wall', 'world_static', [0, 1_000, 1_000], [2_000, 1_000, 100]),
      ],
      [boxVolume('far_recovery', 'recovery', [-2_500, 500, -2_500], [100, 500, 100])],
    );
    const world = await createRapierMovementWorld(source);
    worlds.push(world);
    const result = world.moveCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(2_000, 0, 2_000),
      settings: { ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query, maximumContacts: 1 },
      solidLayers: ['world_static'],
    });
    expect(result.contacts.length).toBeLessThanOrEqual(1);
    expect(result.contacts[0]?.colliderId).toBe('a_wall');
  });

  it('returns identical quantized results across separately constructed worlds', async () => {
    const left = await createWorld('teleport_lab');
    const right = await createWorld('teleport_lab');
    const request = {
      feetPosition: position(-3_000, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      translation: position(6_000, 0, 0),
      contactSkin: asMillimeters(20),
      solidLayers: SOLID_LAYERS,
    } as const;
    expect(left.castCapsule(request)).toEqual(right.castCapsule(request));
  });

  it('fails closed on invalid query shapes and layer categories', async () => {
    const world = await createWorld('flat_run');
    expect(() => world.overlapCapsule({
      feetPosition: position(0, 0, 0),
      shape: { height: asMillimeters(600), radius: asMillimeters(350) },
      solidLayers: ['world_static'],
    })).toThrow(RangeError);
    expect(() => world.overlapCapsule({
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      solidLayers: ['kill_volume'],
    })).toThrow(RangeError);
  });

  it('accepts zero-valued profile thresholds and rejects every out-of-range setting', async () => {
    const world = await createWorld('flat_run');
    const baseRequest = {
      feetPosition: position(0, 0, 0),
      shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
      desiredTranslation: position(0, 0, 0),
      solidLayers: ['world_static'] as const,
    };
    const minimumSettings: MovementQuerySettings = {
      ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.query,
      contactSkin: asMillimeters(0),
      maxStepHeight: asMillimeters(0),
      minimumStepWidth: asMillimeters(0),
      snapToGroundDistance: asMillimeters(0),
      maximumSlopeClimb: asMilliDegrees(0),
      minimumSlopeSlide: asMilliDegrees(0),
    };
    expect(() => world.moveCapsule({ ...baseRequest, settings: minimumSettings })).not.toThrow();

    const invalidSettings: readonly (readonly [string, MovementQuerySettings])[] = [
      ['contactSkin', {
        ...minimumSettings,
        contactSkin: asMillimeters(1_001),
      }],
      ['maxStepHeight', {
        ...minimumSettings,
        maxStepHeight: asMillimeters(5_001),
      }],
      ['minimumStepWidth', {
        ...minimumSettings,
        minimumStepWidth: asMillimeters(10_001),
      }],
      ['snapToGroundDistance', {
        ...minimumSettings,
        snapToGroundDistance: asMillimeters(5_001),
      }],
      ['maximumSlopeClimb', {
        ...minimumSettings,
        maximumSlopeClimb: asMilliDegrees(90_000),
      }],
      ['minimumSlopeSlide', {
        ...minimumSettings,
        minimumSlopeSlide: asMilliDegrees(90_000),
      }],
      ['maximumContacts', {
        ...minimumSettings,
        maximumContacts: 33,
      }],
      ['allowDynamicBodyAutostep', {
        ...minimumSettings,
        allowDynamicBodyAutostep: 'false',
      } as unknown as MovementQuerySettings],
    ];
    for (const [label, settings] of invalidSettings) {
      expect(() => world.moveCapsule({ ...baseRequest, settings })).toThrow(label);
    }
  });
});
