import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID,
  KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1,
  advanceAutoRifle,
  createAutoRifleState,
  createTargetPoseHistory,
  createInkfallRevision2RapierCombatWorldPorts,
  recordTargetPoseSample,
  resolveAuthoritativeAutoRifleHitscan,
  type AutoRifleShotAcceptedEvent,
} from '../../../src/authority/combat';
import { INKFALL_AUTHORITY_MAP_IDENTITY_V2 } from '../../../src/authority/inkfallMapIdentity';
import {
  DEFAULT_MAP_REVISION,
  requireBundledMapPackageManifest,
} from '../../../src/content/maps';
import {
  IMPULSE_GRENADE_SOLID_LAYERS,
} from '../../../src/authority/combat/impulseGrenade';
import {
  convertAuthorityCollisionGlbToFixture,
  createRapierMovementWorld,
  type PhysicsFixtureV1,
  type RapierMovementWorld,
} from '../../../src/physics';

interface GeneratedFixtureSnapshot {
  readonly schemaVersion: 1;
  readonly kind: 'inkfall_revision_2_combat_authority_fixture';
  readonly mapId: string;
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly collisionPath: string;
  readonly collisionSha256: string;
  readonly collisionBytes: number;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly authorityVolumeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
const generatedFixtureUrl = new URL(
  '../../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
  import.meta.url,
);

let snapshot: GeneratedFixtureSnapshot;
let worldA: RapierMovementWorld;
let worldB: RapierMovementWorld;
let portsA: ReturnType<typeof createInkfallRevision2RapierCombatWorldPorts>;
let portsB: ReturnType<typeof createInkfallRevision2RapierCombatWorldPorts>;

const downwardSpawnRay = Object.freeze({
  schemaVersion: 1 as const,
  originMillimeters: Object.freeze({ x: -33_500, y: 2_000, z: -3_500 }),
  directionUnit: Object.freeze({ x: 0, y: -1, z: 0 }),
  maximumDistanceMillimeters: 120_000 as const,
  layer: 'authoritative_world' as const,
});

const clearSkyRay = Object.freeze({
  schemaVersion: 1 as const,
  originMillimeters: Object.freeze({ x: 0, y: 20_000, z: 0 }),
  directionUnit: Object.freeze({ x: 0, y: 1, z: 0 }),
  maximumDistanceMillimeters: 120_000 as const,
  layer: 'authoritative_world' as const,
});

const downwardSphereSweep = Object.freeze({
  schemaVersion: 1 as const,
  authorityTick: 10,
  projectileId: 'grenade.probe.1',
  ownerPlayerId: 'player.probe.1',
  centerMillimeters: Object.freeze({ x: -33_500, y: 1_000, z: -3_500 }),
  translationMillimeters: Object.freeze({ x: 0, y: -2_000, z: 0 }),
  radiusMillimeters: 100,
  solidLayers: IMPULSE_GRENADE_SOLID_LAYERS,
  ignoredPlayerIds: Object.freeze(['player.probe.1']),
});

beforeAll(async () => {
  snapshot = JSON.parse(await readFile(generatedFixtureUrl, 'utf8')) as GeneratedFixtureSnapshot;
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 2);
  const collision = await readFile(new URL(manifest.artifacts.collision.path, mapRoot));
  const converted = convertAuthorityCollisionGlbToFixture(manifest, collision);

  expect(snapshot).toMatchObject({
    schemaVersion: 1,
    kind: 'inkfall_revision_2_combat_authority_fixture',
    mapId: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId,
    mapRevision: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapRevision,
    packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
    collisionPath: manifest.artifacts.collision.path,
    collisionSha256: manifest.artifacts.collision.sha256,
    collisionBytes: manifest.artifacts.collision.bytes,
    fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
    collisionMeshNodeCount: INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality,
    authorityVolumeCount: 2,
  });
  expect(converted.fixtureHash).toBe(snapshot.fixtureHash);
  expect(converted.fixture).toEqual(snapshot.fixture);

  [worldA, worldB] = await Promise.all([
    createRapierMovementWorld(snapshot.fixture),
    createRapierMovementWorld(snapshot.fixture),
  ]);
  portsA = createInkfallRevision2RapierCombatWorldPorts(worldA);
  portsB = createInkfallRevision2RapierCombatWorldPorts(worldB);
});

afterAll(() => {
  worldA?.dispose();
  worldB?.dispose();
});

describe('Inkfall revision-2 Rapier combat world binding', () => {
  it('pins the non-default fixture identity without promoting the accepted map default', () => {
    expect(DEFAULT_MAP_REVISION).toBe(1);
    expect(portsA).toMatchObject({
      capabilityId: INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID,
      mapId: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId,
      mapRevision: 2,
      packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
      fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
      colliderCardinality: 339,
    });
    expect(worldA.fixture.solids).toHaveLength(339);
    expect(worldA.fixture.volumes).toHaveLength(2);
  });

  it('resolves stable world occlusion and clear sky rays across independent worlds', () => {
    const hitA = portsA.worldOcclusion(downwardSpawnRay) as Readonly<{
      schemaVersion: 1;
      hit: boolean;
      distanceMillimeters: number | null;
      colliderId: string | null;
    }>;
    const clearA = portsA.worldOcclusion(clearSkyRay);
    const clearB = portsB.worldOcclusion(clearSkyRay);
    const hitB = portsB.worldOcclusion(downwardSpawnRay);

    expect(hitA).toEqual(hitB);
    expect(clearA).toEqual(clearB);
    expect(hitA).toEqual({
      schemaVersion: 1,
      hit: true,
      distanceMillimeters: 2_000,
      colliderId: 'map_collision_spawn_pad_spawn_w_press_a',
    });
    expect(clearA).toEqual({
      schemaVersion: 1,
      hit: false,
      distanceMillimeters: null,
      colliderId: null,
    });
  });

  it('locks the retained v29 vertical miss and the verified v25 Ink Channel damage pair', () => {
    const standingHitVolumes = KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1.map((volume) => ({
      ...volume,
      centerOffsetMillimeters: {
        ...volume.centerOffsetMillimeters,
        y: Math.round(volume.centerOffsetMillimeters.y * 1_800 / 1_940),
      },
      halfExtentsMillimeters: {
        ...volume.halfExtentsMillimeters,
        y: Math.max(1, Math.round(volume.halfExtentsMillimeters.y * 1_800 / 1_940)),
      },
    }));
    const v29 = Object.freeze({
      shooter: Object.freeze({ x: -3_694, y: -2_822, z: -15_795, yaw: 84_000 }),
      target: Object.freeze({ x: 3_468, y: -2_900, z: -14_986, yaw: -96_000 }),
    });
    const v25 = Object.freeze({
      shooter: Object.freeze({ x: -2_688, y: -2_927, z: -16_070, yaw: 79_500 }),
      target: Object.freeze({ x: 3_224, y: -2_825, z: -15_009, yaw: -100_500 }),
    });
    const bounded = Object.freeze({
      shooter: Object.freeze({ x: 400, y: -2_980, z: -15_550, yaw: 78_965 }),
      target: Object.freeze({ x: 2_323, y: -2_980, z: -15_175, yaw: -101_035 }),
    });
    const sightLine = (
      shooter: Readonly<{ x: number; y: number; z: number }>,
      target: Readonly<{ x: number; y: number; z: number }>,
    ) => {
      const deltaX = target.x - shooter.x;
      const deltaZ = target.z - shooter.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const direction = { x: deltaX / distance, y: 0, z: deltaZ / distance };
      const muzzle = {
        x: shooter.x + Math.round(direction.x * 200),
        y: shooter.y + 1_700,
        z: shooter.z + Math.round(direction.z * 200),
      };
      return {
        distance,
        muzzle,
        hit: portsA.worldOcclusion({
          schemaVersion: 1,
          originMillimeters: muzzle,
          directionUnit: direction,
          maximumDistanceMillimeters: 120_000,
          layer: 'authoritative_world',
        }),
      };
    };
    const resolvePair = (
      shooter: Readonly<{ x: number; y: number; z: number; yaw: number }>,
      target: Readonly<{ x: number; y: number; z: number; yaw: number }>,
      acceptedShot: AutoRifleShotAcceptedEvent,
    ) => resolveAuthoritativeAutoRifleHitscan({
      schemaVersion: 1,
      currentAuthorityTick: 100,
      serverReceiptTick: 100,
      shooterPose: {
        schemaVersion: 1,
        authorityTick: 100,
        playerId: 'player_shooter',
        teamId: 'team_blue',
        lifePhase: 'alive',
        positionMillimeters: { x: shooter.x, y: shooter.y, z: shooter.z },
        bodyYawMilliDegrees: shooter.yaw,
        eyeOffsetMillimeters: { x: 0, y: 1_700, z: 0 },
        muzzleOffsetMillimeters: { x: 0, y: 1_700, z: 200 },
      },
      acceptedLook: {
        schemaVersion: 1,
        acceptedAtAuthorityTick: 100,
        yawMilliDegrees: shooter.yaw,
        pitchMilliDegrees: 0,
      },
      acceptedShot: {
        ...acceptedShot,
        authorityTick: 100,
        playerId: 'player_shooter',
        nextShotAtTick: 102,
      },
      observedRttHistory: [{
        schemaVersion: 1,
        observedAtReceiptTick: 100,
        roundTripMilliseconds: 0,
      }],
      targetHistories: [recordTargetPoseSample(
        createTargetPoseHistory('player_target'),
        {
          schemaVersion: 1,
          authorityTick: 100,
          teamId: 'team_red',
          lifePhase: 'alive',
          positionMillimeters: { x: target.x, y: target.y, z: target.z },
          bodyYawMilliDegrees: target.yaw,
          hitVolumes: standingHitVolumes,
        },
      )],
    }, portsA.worldOcclusion);
    let rifle = createAutoRifleState({
      playerId: 'player.753cf9de-ee36-4f1a-8072-599c38f72161',
      roomSeed: 'match.fd03279966ea439da69a841b28971826',
      authorityTick: 0,
    });
    const acceptedShots: AutoRifleShotAcceptedEvent[] = [];
    for (let authorityTick = 1; authorityTick <= 27; authorityTick += 1) {
      const advanced = advanceAutoRifle(rifle, {
        authorityTick,
        authorityInputSequence: authorityTick,
        lifePhase: 'alive',
        weaponSelected: true,
        sprintHeld: false,
        fireHeld: authorityTick >= 5,
        reloadPressed: false,
      });
      if (!advanced.accepted) throw new Error(advanced.reason);
      rifle = advanced.state;
      if (advanced.shot !== null) acceptedShots.push(advanced.shot);
    }
    expect(acceptedShots).toHaveLength(12);

    const v29SightLine = sightLine(v29.shooter, v29.target);
    const v25SightLine = sightLine(v25.shooter, v25.target);
    expect(v29SightLine.distance).toBeCloseTo(7_207.546, 3);
    expect(v25SightLine.distance).toBeCloseTo(6_006.452, 3);
    expect(v29SightLine.hit).toEqual({
      schemaVersion: 1,
      hit: false,
      distanceMillimeters: null,
      colliderId: null,
    });
    expect(v25SightLine.hit).toEqual({
      schemaVersion: 1,
      hit: false,
      distanceMillimeters: null,
      colliderId: null,
    });
    expect(v29.target.y + 1_800 - (v29.shooter.y + 1_700)).toBe(22);
    expect(v25.target.y + 1_800 - (v25.shooter.y + 1_700)).toBe(202);

    const v29Pattern = acceptedShots.map((shot) => resolvePair(v29.shooter, v29.target, shot));
    expect(v29Pattern.every((result) => (
      result.accepted
      && result.outcome === 'miss'
      && result.reason === 'no_target'
      && result.debug.analyticVolumeIntersectionCount === 0
      && result.debug.worldOcclusion?.hit === false
    ))).toBe(true);
    expect(v29Pattern.map((result) => result.debug.aimRay?.finalPitchMilliDegrees))
      .toEqual([1_855, 608, 1_078, 1_032, 585, 847, 801, 685, 713, 515, 656, 1_335]);

    const v25Pattern = acceptedShots.map((shot) => resolvePair(v25.shooter, v25.target, shot));
    expect(v25Pattern.every((result) => (
      result.accepted
      && result.outcome === 'hit'
      && result.hit?.targetPlayerId === 'player_target'
      && (result.hit?.distanceMillimeters ?? Number.POSITIVE_INFINITY) < 6_000
    ))).toBe(true);
    expect(v25Pattern.every((result) => (
      result.debug.worldOcclusion?.hit !== true
      || (
        result.debug.worldOcclusion.distanceMillimeters !== null
        && result.debug.worldOcclusion.distanceMillimeters
          > (result.hit?.distanceMillimeters ?? Number.POSITIVE_INFINITY)
      )
    ))).toBe(true);

    const boundedSightLine = sightLine(bounded.shooter, bounded.target);
    expect(boundedSightLine.distance).toBeCloseTo(1_959.223, 3);
    expect(boundedSightLine.hit).toEqual({
      schemaVersion: 1,
      hit: false,
      distanceMillimeters: null,
      colliderId: null,
    });
    const boundedPattern = acceptedShots.map((shot) => (
      resolvePair(bounded.shooter, bounded.target, shot)
    ));
    expect(boundedPattern.every((result) => result.accepted && result.outcome === 'hit'))
      .toBe(true);
    const verticalWorstShot = {
      ...acceptedShots[0],
      ballistics: {
        ...acceptedShots[0]?.ballistics,
        recoilPitchMilliDegrees: 1_146,
        recoilYawMilliDegrees: 0,
        spreadRadiusMilliDegrees: 1_146,
        spreadPitchMilliDegrees: 1_146,
        spreadYawMilliDegrees: 0,
      },
    } as AutoRifleShotAcceptedEvent;
    const horizontalWorstShot = {
      ...acceptedShots[0],
      ballistics: {
        ...acceptedShots[0]?.ballistics,
        recoilPitchMilliDegrees: 250,
        recoilYawMilliDegrees: 573,
        spreadRadiusMilliDegrees: 1_146,
        spreadPitchMilliDegrees: 0,
        spreadYawMilliDegrees: 1_146,
      },
    } as AutoRifleShotAcceptedEvent;
    const boundedVerticalWorst = resolvePair(bounded.shooter, bounded.target, verticalWorstShot);
    const boundedHorizontalWorst = resolvePair(
      { ...bounded.shooter, yaw: bounded.shooter.yaw + 800 },
      bounded.target,
      horizontalWorstShot,
    );
    expect(boundedVerticalWorst).toMatchObject({ accepted: true, outcome: 'hit' });
    expect(boundedHorizontalWorst).toMatchObject({ accepted: true, outcome: 'hit' });
  });

  it('resolves deterministic grenade sweep, radial occlusion, and collision-safe impulse', () => {
    const sweepA = portsA.impulseGrenadeWorld.sweepSphere(downwardSphereSweep);
    const sweepB = portsB.impulseGrenadeWorld.sweepSphere(downwardSphereSweep);
    const radial = portsA.impulseGrenadeWorld.traceRadialOcclusion(Object.freeze({
      schemaVersion: 1,
      authorityTick: 11,
      projectileId: 'grenade.probe.1',
      sourceMillimeters: Object.freeze({ x: -33_500, y: 1_000, z: -3_500 }),
      targetPlayerId: 'player.probe.2',
      targetMillimeters: Object.freeze({ x: -33_500, y: -1_000, z: -3_500 }),
    }));
    const safeImpulse = portsA.impulseGrenadeWorld.resolveCollisionSafeImpulse(Object.freeze({
      schemaVersion: 1,
      authorityTick: 12,
      projectileId: 'grenade.probe.1',
      targetPlayerId: 'player.probe.2',
      targetFeetPositionMillimeters: Object.freeze({ x: -33_500, y: 0, z: -3_500 }),
      targetCapsule: Object.freeze({ heightMillimeters: 1_800, radiusMillimeters: 400 }),
      currentVelocityMillimetersPerSecond: Object.freeze({ x: 0, y: 0, z: 0 }),
      requestedImpulseMillimetersPerSecond: Object.freeze({ x: 0, y: -20_000, z: 0 }),
    }));

    expect(sweepA).toEqual(sweepB);
    expect(sweepA).toEqual({
      schemaVersion: 1,
      contacts: [{
        colliderId: 'map_collision_spawn_pocket_floor_west',
        layer: 'world_static',
        playerId: null,
        timeOfImpactPermille: 450,
        normalQ15: { x: 0, y: 32_767, z: 0 },
      }],
    });
    expect(radial).toEqual({
      schemaVersion: 1,
      kind: 'blocked',
      colliderId: 'map_collision_spawn_pad_spawn_w_press_a',
    });
    expect(safeImpulse).toEqual({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: { x: 0, y: 0, z: 0 },
    });
  });

  it('fails closed on malformed rays, forged layers, accessors, and the wrong fixture', async () => {
    expect(() => portsA.worldOcclusion({
      ...downwardSpawnRay,
      directionUnit: { x: Number.NaN, y: -1, z: 0 },
    })).toThrow(/finite/u);
    expect(() => portsA.impulseGrenadeWorld.sweepSphere({
      ...downwardSphereSweep,
      solidLayers: ['world_static'],
    } as never)).toThrow(/solid layers/u);

    const accessorRay = { ...downwardSpawnRay } as Record<string, unknown>;
    Object.defineProperty(accessorRay, 'layer', {
      enumerable: true,
      get: () => 'authoritative_world',
    });
    expect(() => portsA.worldOcclusion(accessorRay as never)).toThrow(/accessors/u);

    const wrongWorld = await createRapierMovementWorld({
      ...snapshot.fixture,
      id: 'forged_map_collision',
    });
    try {
      expect(() => createInkfallRevision2RapierCombatWorldPorts(wrongWorld)).toThrow(
        'INKFALL_REVISION_2_COMBAT_WORLD_IDENTITY_MISMATCH',
      );
    } finally {
      wrongWorld.dispose();
    }
  });
});
