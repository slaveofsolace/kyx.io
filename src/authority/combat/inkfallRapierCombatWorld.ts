import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
  type InkfallAuthorityMapIdentity,
} from '../inkfallMapIdentity';
import type { RapierMovementWorld } from '../../physics';
import { asMillimeters } from '../../sim';
import {
  IMPULSE_GRENADE_SOLID_LAYERS,
  IMPULSE_GRENADE_WORLD_ONLY_LAYERS,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type ImpulseGrenadeCollisionLayer,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
  type ImpulseGrenadeRadialOcclusionRequestV1,
  type ImpulseGrenadeSweepSphereRequestV1,
  type ImpulseGrenadeSweepSolidLayers,
  type ImpulseGrenadeVector3,
} from './impulseGrenade';
import type {
  AuthorityWorldOcclusionPort,
  AuthorityWorldOcclusionRayV1,
} from './rewindHitscan';

export const INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID =
  'authoritative_inkfall_revision_2_rapier_combat_v1' as const;
export const INKFALL_REVISION_3_COMBAT_WORLD_CAPABILITY_ID =
  'authoritative_inkfall_revision_3_rapier_combat_v1' as const;
export const INKFALL_REVISION_4_COMBAT_WORLD_CAPABILITY_ID =
  'authoritative_inkfall_revision_4_rapier_combat_v1' as const;

const FIXED_AUTHORITY_HZ = 20;
const INKFALL_REVISION_2_FIXTURE_ID = 'inkfall_foundry_map_collision';
const MAXIMUM_VECTOR_COMPONENT = 20_000_000;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u;
const WORLD_SOLID_LAYERS = IMPULSE_GRENADE_WORLD_ONLY_LAYERS;

type StrictRecord = Record<string, unknown>;

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): StrictRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unexpected fields`);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!('value' in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new TypeError(`${label} cannot contain accessors`);
    }
  }
  return value as StrictRecord;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function stableId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 96 || !STABLE_ID.test(value)) {
    throw new RangeError(`${label} must be a stable ID`);
  }
  return value;
}

function vector(value: unknown, label: string): ImpulseGrenadeVector3 {
  const item = strictRecord(value, ['x', 'y', 'z'], label);
  return Object.freeze({
    x: integer(item.x, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, `${label}.x`),
    y: integer(item.y, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, `${label}.y`),
    z: integer(item.z, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, `${label}.z`),
  });
}

function assertExactSolidLayers(value: unknown): ImpulseGrenadeSweepSolidLayers {
  if (Array.isArray(value)) {
    const contracts = [IMPULSE_GRENADE_SOLID_LAYERS, IMPULSE_GRENADE_WORLD_ONLY_LAYERS] as const;
    for (const contract of contracts) {
      if (
        value.length === contract.length
        && contract.every((layer, index) => value[index] === layer)
      ) {
        return contract;
      }
    }
  }
  throw new RangeError('impulse grenade solid layers do not match an authority contract');
}

function assertIgnoredPlayers(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new RangeError('ignored player IDs must be a bounded array');
  }
  const ids = value.map((id, index) => stableId(id, `ignored player ID ${index}`));
  if (new Set(ids).size !== ids.length) throw new RangeError('ignored player IDs must be unique');
  return Object.freeze(ids);
}

function oneTickTranslation(velocity: ImpulseGrenadeVector3): ImpulseGrenadeVector3 {
  return Object.freeze({
    x: Math.trunc(velocity.x / FIXED_AUTHORITY_HZ),
    y: Math.trunc(velocity.y / FIXED_AUTHORITY_HZ),
    z: Math.trunc(velocity.z / FIXED_AUTHORITY_HZ),
  });
}

function movementVector(value: ImpulseGrenadeVector3) {
  return Object.freeze({
    x: asMillimeters(value.x),
    y: asMillimeters(value.y),
    z: asMillimeters(value.z),
  });
}

function isImpulseGrenadeCollisionLayer(
  value: string,
): value is ImpulseGrenadeCollisionLayer {
  return (IMPULSE_GRENADE_SOLID_LAYERS as readonly string[]).includes(value);
}

function addVector(
  left: ImpulseGrenadeVector3,
  right: ImpulseGrenadeVector3,
): ImpulseGrenadeVector3 {
  return Object.freeze({
    x: integer(left.x + right.x, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, 'velocity.x'),
    y: integer(left.y + right.y, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, 'velocity.y'),
    z: integer(left.z + right.z, -MAXIMUM_VECTOR_COMPONENT, MAXIMUM_VECTOR_COMPONENT, 'velocity.z'),
  });
}

function scaleTowardZero(value: number, permille: number): number {
  const scaled = Math.trunc(value * permille / 1_000);
  return Object.is(scaled, -0) ? 0 : scaled;
}

function assertInkfallWorld(
  world: RapierMovementWorld,
  identity: InkfallAuthorityMapIdentity,
): void {
  if (
    world.fixture.id !== INKFALL_REVISION_2_FIXTURE_ID
    || world.fixture.revision !== identity.mapRevision
    || world.fixtureHash !== identity.fixtureHash
    || world.fixture.solids.length !== identity.colliderCardinality
    || world.fixture.volumes.length !== 2
    || world.fixture.solids.some((solid) => solid.layer !== 'world_static')
  ) {
    throw new Error(`INKFALL_REVISION_${identity.mapRevision}_COMBAT_WORLD_IDENTITY_MISMATCH`);
  }
}

function validateHitscanRay(value: AuthorityWorldOcclusionRayV1): AuthorityWorldOcclusionRayV1 {
  const item = strictRecord(value, [
    'schemaVersion',
    'originMillimeters',
    'directionUnit',
    'maximumDistanceMillimeters',
    'layer',
    'purpose',
  ], 'hitscan world ray');
  if (item.schemaVersion !== 1 || item.layer !== 'authoritative_world') {
    throw new RangeError('hitscan world ray identity is unsupported');
  }
  if (
    typeof item.maximumDistanceMillimeters !== 'number'
    || !Number.isFinite(item.maximumDistanceMillimeters)
    || item.maximumDistanceMillimeters <= 0
    || item.maximumDistanceMillimeters > 200_000
  ) {
    throw new RangeError('hitscan world ray range is unsupported');
  }
  if (item.purpose !== 'barrel_clearance' && item.purpose !== 'shot_path') {
    throw new RangeError('hitscan world ray purpose is unsupported');
  }
  const origin = vector(item.originMillimeters, 'hitscan world ray origin');
  const direction = strictRecord(item.directionUnit, ['x', 'y', 'z'], 'hitscan direction');
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(direction[axis])) throw new RangeError(`hitscan direction.${axis} must be finite`);
  }
  const magnitude = Math.hypot(
    direction.x as number,
    direction.y as number,
    direction.z as number,
  );
  if (Math.abs(magnitude - 1) > 0.000_001) throw new RangeError('hitscan direction must be unit length');
  return Object.freeze({
    schemaVersion: 1,
    originMillimeters: origin,
    directionUnit: Object.freeze({
      x: direction.x as number,
      y: direction.y as number,
      z: direction.z as number,
    }),
    maximumDistanceMillimeters: item.maximumDistanceMillimeters,
    layer: 'authoritative_world',
    purpose: item.purpose,
  });
}

function validateSweep(value: ImpulseGrenadeSweepSphereRequestV1): {
  readonly center: ImpulseGrenadeVector3;
  readonly translation: ImpulseGrenadeVector3;
  readonly radius: number;
  readonly solidLayers: ImpulseGrenadeSweepSolidLayers;
} {
  const item = strictRecord(value, [
    'schemaVersion', 'authorityTick', 'projectileId', 'ownerPlayerId',
    'centerMillimeters', 'translationMillimeters', 'radiusMillimeters',
    'solidLayers', 'ignoredPlayerIds',
  ], 'impulse grenade sphere sweep');
  if (item.schemaVersion !== 1) throw new RangeError('impulse grenade sphere sweep schema is unsupported');
  integer(item.authorityTick, 0, Number.MAX_SAFE_INTEGER - 100_000, 'authorityTick');
  stableId(item.projectileId, 'projectileId');
  stableId(item.ownerPlayerId, 'ownerPlayerId');
  const solidLayers = assertExactSolidLayers(item.solidLayers);
  assertIgnoredPlayers(item.ignoredPlayerIds);
  return Object.freeze({
    center: vector(item.centerMillimeters, 'sphere center'),
    translation: vector(item.translationMillimeters, 'sphere translation'),
    radius: integer(item.radiusMillimeters, 1, 5_000, 'sphere radius'),
    solidLayers,
  });
}

function validateRadial(value: ImpulseGrenadeRadialOcclusionRequestV1): {
  readonly source: ImpulseGrenadeVector3;
  readonly target: ImpulseGrenadeVector3;
} {
  const item = strictRecord(value, [
    'schemaVersion', 'authorityTick', 'projectileId', 'sourceMillimeters',
    'targetPlayerId', 'targetMillimeters',
  ], 'impulse grenade radial occlusion');
  if (item.schemaVersion !== 1) throw new RangeError('radial occlusion schema is unsupported');
  integer(item.authorityTick, 0, Number.MAX_SAFE_INTEGER - 100_000, 'authorityTick');
  stableId(item.projectileId, 'projectileId');
  stableId(item.targetPlayerId, 'targetPlayerId');
  return Object.freeze({
    source: vector(item.sourceMillimeters, 'radial source'),
    target: vector(item.targetMillimeters, 'radial target'),
  });
}

function validateSafeImpulse(value: ImpulseGrenadeCollisionSafeImpulseRequestV1): {
  readonly feet: ImpulseGrenadeVector3;
  readonly height: number;
  readonly radius: number;
  readonly current: ImpulseGrenadeVector3;
  readonly requested: ImpulseGrenadeVector3;
} {
  const item = strictRecord(value, [
    'schemaVersion', 'authorityTick', 'projectileId', 'targetPlayerId',
    'targetFeetPositionMillimeters', 'targetCapsule',
    'currentVelocityMillimetersPerSecond', 'requestedImpulseMillimetersPerSecond',
  ], 'collision-safe impulse');
  if (item.schemaVersion !== 1) throw new RangeError('collision-safe impulse schema is unsupported');
  integer(item.authorityTick, 0, Number.MAX_SAFE_INTEGER - 100_000, 'authorityTick');
  stableId(item.projectileId, 'projectileId');
  stableId(item.targetPlayerId, 'targetPlayerId');
  const capsule = strictRecord(item.targetCapsule, [
    'heightMillimeters', 'radiusMillimeters',
  ], 'target capsule');
  const height = integer(capsule.heightMillimeters, 1, 10_000, 'capsule height');
  const radius = integer(capsule.radiusMillimeters, 1, 5_000, 'capsule radius');
  if (height < radius * 2) throw new RangeError('capsule height must be at least its diameter');
  return Object.freeze({
    feet: vector(item.targetFeetPositionMillimeters, 'target feet'),
    height,
    radius,
    current: vector(item.currentVelocityMillimetersPerSecond, 'current velocity'),
    requested: vector(item.requestedImpulseMillimetersPerSecond, 'requested impulse'),
  });
}

export interface InkfallRevision2RapierCombatWorldPorts {
  readonly capabilityId: typeof INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID;
  readonly mapId: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId;
  readonly mapRevision: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapRevision;
  readonly packageDigest: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest;
  readonly fixtureHash: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash;
  readonly colliderCardinality: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality;
  readonly worldOcclusion: AuthorityWorldOcclusionPort;
  readonly impulseGrenadeWorld: AuthorityImpulseGrenadeWorldPort;
}

export interface InkfallRevision3RapierCombatWorldPorts {
  readonly capabilityId: typeof INKFALL_REVISION_3_COMBAT_WORLD_CAPABILITY_ID;
  readonly mapId: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapId;
  readonly mapRevision: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapRevision;
  readonly packageDigest: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V3.packageDigest;
  readonly fixtureHash: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash;
  readonly colliderCardinality: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality;
  readonly worldOcclusion: AuthorityWorldOcclusionPort;
  readonly impulseGrenadeWorld: AuthorityImpulseGrenadeWorldPort;
}

export interface InkfallRevision4RapierCombatWorldPorts {
  readonly capabilityId: typeof INKFALL_REVISION_4_COMBAT_WORLD_CAPABILITY_ID;
  readonly mapId: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V4.mapId;
  readonly mapRevision: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V4.mapRevision;
  readonly packageDigest: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V4.packageDigest;
  readonly fixtureHash: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V4.fixtureHash;
  readonly colliderCardinality: typeof INKFALL_AUTHORITY_MAP_IDENTITY_V4.colliderCardinality;
  readonly worldOcclusion: AuthorityWorldOcclusionPort;
  readonly impulseGrenadeWorld: AuthorityImpulseGrenadeWorldPort;
}

function createInkfallRapierCombatWorldPorts(
  world: RapierMovementWorld,
  identity: InkfallAuthorityMapIdentity,
  capabilityId:
    | typeof INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID
    | typeof INKFALL_REVISION_3_COMBAT_WORLD_CAPABILITY_ID
    | typeof INKFALL_REVISION_4_COMBAT_WORLD_CAPABILITY_ID,
) {
  assertInkfallWorld(world, identity);

  const worldOcclusion: AuthorityWorldOcclusionPort = (rawRay) => {
    const ray = validateHitscanRay(rawRay);
    // Hitscan barrel-clearance rays are derived from the Euclidean distance
    // between two integer millimeter points, so their length can be
    // fractional. Rapier's deterministic adapter accepts integer millimeters;
    // cast conservatively through the final partial millimeter, then discard a
    // quantized hit that lies beyond the caller's original range.
    const castMaximumDistanceMillimeters = Math.max(
      1,
      Math.ceil(ray.maximumDistanceMillimeters),
    );
    const result = world.castSolidRay({
      originMillimeters: ray.originMillimeters,
      directionUnit: ray.directionUnit,
      maximumDistanceMillimeters: castMaximumDistanceMillimeters,
      solidLayers: WORLD_SOLID_LAYERS,
      solid: true,
    });
    return result.hit === null
      || result.hit.distanceMillimeters > ray.maximumDistanceMillimeters
      ? Object.freeze({
          schemaVersion: 1 as const,
          hit: false as const,
          distanceMillimeters: null,
          colliderId: null,
        })
      : Object.freeze({
          schemaVersion: 1 as const,
          hit: true as const,
          distanceMillimeters: result.hit.distanceMillimeters,
          colliderId: result.hit.colliderId,
        });
  };

  const impulseGrenadeWorld: AuthorityImpulseGrenadeWorldPort = Object.freeze({
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere(rawRequest: ImpulseGrenadeSweepSphereRequestV1) {
      const request = validateSweep(rawRequest);
      const cast = world.castCapsule({
        feetPosition: movementVector({
          x: request.center.x,
          y: request.center.y - request.radius,
          z: request.center.z,
        }),
        translation: movementVector(request.translation),
        shape: {
          height: asMillimeters(request.radius * 2),
          radius: asMillimeters(request.radius),
        },
        solidLayers: request.solidLayers,
        contactSkin: asMillimeters(0),
      });
      if (cast.hit === null) {
        return Object.freeze({ schemaVersion: 1 as const, contacts: Object.freeze([]) });
      }
      if (!isImpulseGrenadeCollisionLayer(cast.hit.layer)) {
        throw new Error('INKFALL_STATIC_COMBAT_WORLD_RETURNED_NON_SOLID_COLLIDER');
      }
      if (!(request.solidLayers as readonly string[]).includes(cast.hit.layer)) {
        throw new Error('INKFALL_STATIC_COMBAT_WORLD_RETURNED_UNREQUESTED_COLLIDER');
      }
      if (cast.hit.layer === 'player_body') {
        throw new Error('INKFALL_STATIC_COMBAT_WORLD_RETURNED_PLAYER_COLLIDER');
      }
      return Object.freeze({
        schemaVersion: 1 as const,
        contacts: Object.freeze([Object.freeze({
          colliderId: cast.hit.colliderId,
          layer: cast.hit.layer,
          playerId: null,
          timeOfImpactPermille: cast.hit.timeOfImpactPermille,
          normalQ15: Object.freeze({ ...cast.hit.normalQ15 }),
        })]),
      });
    },
    traceRadialOcclusion(rawRequest: ImpulseGrenadeRadialOcclusionRequestV1) {
      const request = validateRadial(rawRequest);
      const delta = {
        x: request.target.x - request.source.x,
        y: request.target.y - request.source.y,
        z: request.target.z - request.source.z,
      };
      const distance = Math.hypot(delta.x, delta.y, delta.z);
      if (distance === 0) return Object.freeze({ schemaVersion: 1 as const, kind: 'clear' as const });
      const cast = world.castSolidRay({
        originMillimeters: request.source,
        directionUnit: {
          x: delta.x / distance,
          y: delta.y / distance,
          z: delta.z / distance,
        },
        maximumDistanceMillimeters: Math.max(1, Math.ceil(distance)),
        solidLayers: WORLD_SOLID_LAYERS,
        solid: true,
      });
      return cast.hit !== null && cast.hit.distanceMillimeters <= distance
        ? Object.freeze({
            schemaVersion: 1 as const,
            kind: 'blocked' as const,
            colliderId: cast.hit.colliderId,
          })
        : Object.freeze({ schemaVersion: 1 as const, kind: 'clear' as const });
    },
    resolveCollisionSafeImpulse(rawRequest: ImpulseGrenadeCollisionSafeImpulseRequestV1) {
      const request = validateSafeImpulse(rawRequest);
      const combinedVelocity = addVector(request.current, request.requested);
      const combinedTranslation = oneTickTranslation(combinedVelocity);
      const castRequest = {
        feetPosition: movementVector(request.feet),
        shape: {
          height: asMillimeters(request.height),
          radius: asMillimeters(request.radius),
        },
        solidLayers: IMPULSE_GRENADE_SOLID_LAYERS,
        contactSkin: asMillimeters(1),
      } as const;
      const combinedCast = world.castCapsule({
        ...castRequest,
        translation: movementVector(combinedTranslation),
      });
      if (combinedCast.hit === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          appliedImpulseMillimetersPerSecond: Object.freeze({ ...request.requested }),
        });
      }
      const requestedCast = world.castCapsule({
        ...castRequest,
        translation: movementVector(oneTickTranslation(request.requested)),
      });
      if (requestedCast.hit === null) {
        return Object.freeze({
          schemaVersion: 1 as const,
          appliedImpulseMillimetersPerSecond: Object.freeze({ ...request.requested }),
        });
      }
      const safePermille = requestedCast.hit.timeOfImpactPermille >= 1_000
        ? 1_000
        : Math.max(0, requestedCast.hit.timeOfImpactPermille - 1);
      return Object.freeze({
        schemaVersion: 1 as const,
        appliedImpulseMillimetersPerSecond: Object.freeze({
          x: scaleTowardZero(request.requested.x, safePermille),
          y: scaleTowardZero(request.requested.y, safePermille),
          z: scaleTowardZero(request.requested.z, safePermille),
        }),
      });
    },
  });

  return Object.freeze({
    capabilityId,
    mapId: identity.mapId,
    mapRevision: identity.mapRevision,
    packageDigest: identity.packageDigest,
    fixtureHash: identity.fixtureHash,
    colliderCardinality: identity.colliderCardinality,
    worldOcclusion,
    impulseGrenadeWorld,
  });
}

export function createInkfallRevision2RapierCombatWorldPorts(
  world: RapierMovementWorld,
): InkfallRevision2RapierCombatWorldPorts {
  return createInkfallRapierCombatWorldPorts(
    world,
    INKFALL_AUTHORITY_MAP_IDENTITY_V2,
    INKFALL_REVISION_2_COMBAT_WORLD_CAPABILITY_ID,
  ) as InkfallRevision2RapierCombatWorldPorts;
}

export function createInkfallRevision3RapierCombatWorldPorts(
  world: RapierMovementWorld,
): InkfallRevision3RapierCombatWorldPorts {
  return createInkfallRapierCombatWorldPorts(
    world,
    INKFALL_AUTHORITY_MAP_IDENTITY_V3,
    INKFALL_REVISION_3_COMBAT_WORLD_CAPABILITY_ID,
  ) as InkfallRevision3RapierCombatWorldPorts;
}

export function createInkfallRevision4RapierCombatWorldPorts(
  world: RapierMovementWorld,
): InkfallRevision4RapierCombatWorldPorts {
  return createInkfallRapierCombatWorldPorts(
    world,
    INKFALL_AUTHORITY_MAP_IDENTITY_V4,
    INKFALL_REVISION_4_COMBAT_WORLD_CAPABILITY_ID,
  ) as InkfallRevision4RapierCombatWorldPorts;
}
