import type {
  FixtureSolidLayer,
  FixtureSolidV1,
  FixtureVector3Millimeters,
  FixtureVolumeV1,
  PhysicsFixtureV1,
} from '../fixtureSchema';
import {
  MILLIMETERS_PER_RAPIER_UNIT,
  PHYSICS_FIXTURE_SCHEMA_VERSION,
} from '../fixtureSchema';
import type { MovementVolumeKind } from '../../sim/movement/queryPort';

type VectorTuple = readonly [x: number, y: number, z: number];

function vector([x, y, z]: VectorTuple): FixtureVector3Millimeters {
  return { x, y, z };
}

export function boxSolid(
  id: string,
  layer: FixtureSolidLayer,
  center: VectorTuple,
  halfExtents: VectorTuple,
  rotation: VectorTuple = [0, 0, 0],
  velocity: VectorTuple = [0, 0, 0],
): FixtureSolidV1 {
  const body = layer === 'dynamic_platform' ? 'kinematic' : 'fixed';
  return {
    id,
    layer,
    body,
    centerMm: vector(center),
    rotationMilliDegrees: vector(rotation),
    velocityMmPerSecond: vector(velocity),
    shape: { type: 'box', halfExtentsMm: vector(halfExtents) },
  };
}

export function capsuleSolid(
  id: string,
  layer: Exclude<FixtureSolidLayer, 'dynamic_platform'>,
  center: VectorTuple,
  heightMm: number,
  radiusMm: number,
): FixtureSolidV1 {
  return {
    id,
    layer,
    body: 'fixed',
    centerMm: vector(center),
    rotationMilliDegrees: vector([0, 0, 0]),
    velocityMmPerSecond: vector([0, 0, 0]),
    shape: { type: 'capsule', heightMm, radiusMm },
  };
}

const VOLUME_LAYER = Object.freeze({
  kill: 'kill_volume',
  forbidden: 'forbidden_volume',
  recovery: 'recovery_volume',
} as const);

export function boxVolume(
  id: string,
  kind: MovementVolumeKind,
  center: VectorTuple,
  halfExtents: VectorTuple,
): FixtureVolumeV1 {
  return {
    id,
    kind,
    layer: VOLUME_LAYER[kind],
    centerMm: vector(center),
    rotationMilliDegrees: vector([0, 0, 0]),
    shape: { type: 'box', halfExtentsMm: vector(halfExtents) },
  };
}

export function fixture(
  id: string,
  spawnFeet: VectorTuple,
  solids: readonly FixtureSolidV1[],
  volumes: readonly FixtureVolumeV1[],
): PhysicsFixtureV1 {
  return {
    schemaVersion: PHYSICS_FIXTURE_SCHEMA_VERSION,
    id,
    revision: 1,
    millimetersPerRapierUnit: MILLIMETERS_PER_RAPIER_UNIT,
    spawn: {
      feetPositionMm: vector(spawnFeet),
      yawMilliDegrees: 0,
    },
    solids,
    volumes,
  };
}

