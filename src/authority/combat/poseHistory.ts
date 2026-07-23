import {
  assertStrictCombatDataTree,
  deepFreezeCombatValue,
  strictArray,
  strictInteger,
  strictLiteral,
  strictNullableStableId,
  strictRecord,
  strictStableId,
} from './strictCombatData';

export const COMBAT_POSE_HISTORY_AUTHORITY_HZ = 20 as const;
export const COMBAT_POSE_HISTORY_CAPACITY_SAMPLES = 16 as const;
export const COMBAT_MAX_HIT_VOLUMES_PER_POSE = 16 as const;

const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - COMBAT_POSE_HISTORY_CAPACITY_SAMPLES;
const MAX_WORLD_COORDINATE_MILLIMETERS = 2_000_000;
const MAX_LOCAL_OFFSET_MILLIMETERS = 10_000;
const MAX_HALF_EXTENT_MILLIMETERS = 5_000;

export interface CombatVector3Millimeters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CombatHitRegion = 'head' | 'torso' | 'limb';

/** A body-yaw-oriented analytic box, stored in target-local millimetres. */
export interface CombatHitVolumeBoxV1 {
  readonly schemaVersion: 1;
  readonly volumeId: string;
  readonly region: CombatHitRegion;
  readonly centerOffsetMillimeters: CombatVector3Millimeters;
  readonly halfExtentsMillimeters: CombatVector3Millimeters;
}

export interface TargetPoseSampleV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly teamId: string | null;
  readonly lifePhase: 'alive' | 'dead';
  readonly positionMillimeters: CombatVector3Millimeters;
  readonly bodyYawMilliDegrees: number;
  readonly hitVolumes: readonly CombatHitVolumeBoxV1[];
}

export interface TargetPoseHistoryV1 {
  readonly schemaVersion: 1;
  readonly authorityHz: 20;
  readonly capacitySamples: 16;
  readonly playerId: string;
  readonly samples: readonly TargetPoseSampleV1[];
}

function region(value: unknown, label: string): CombatHitRegion {
  if (value !== 'head' && value !== 'torso' && value !== 'limb') {
    throw new RangeError(`${label} must be head, torso, or limb`);
  }
  return value;
}

function vector3(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): CombatVector3Millimeters {
  const record = strictRecord(value, ['x', 'y', 'z'], label);
  return {
    x: strictInteger(record.x, minimum, maximum, `${label}.x`),
    y: strictInteger(record.y, minimum, maximum, `${label}.y`),
    z: strictInteger(record.z, minimum, maximum, `${label}.z`),
  };
}

function cloneVector(value: CombatVector3Millimeters): CombatVector3Millimeters {
  return { x: value.x, y: value.y, z: value.z };
}

function validateHitVolumeWithoutTree(
  value: unknown,
  label: string,
): CombatHitVolumeBoxV1 {
  const record = strictRecord(value, [
    'schemaVersion',
    'volumeId',
    'region',
    'centerOffsetMillimeters',
    'halfExtentsMillimeters',
  ], label);
  strictLiteral(record.schemaVersion, 1, `${label}.schemaVersion`);
  const center = vector3(
    record.centerOffsetMillimeters,
    -MAX_LOCAL_OFFSET_MILLIMETERS,
    MAX_LOCAL_OFFSET_MILLIMETERS,
    `${label}.centerOffsetMillimeters`,
  );
  const halfExtents = vector3(
    record.halfExtentsMillimeters,
    1,
    MAX_HALF_EXTENT_MILLIMETERS,
    `${label}.halfExtentsMillimeters`,
  );
  return {
    schemaVersion: 1,
    volumeId: strictStableId(record.volumeId, `${label}.volumeId`),
    region: region(record.region, `${label}.region`),
    centerOffsetMillimeters: center,
    halfExtentsMillimeters: halfExtents,
  };
}

function validatePoseSampleWithoutTree(value: unknown, label: string): TargetPoseSampleV1 {
  const record = strictRecord(value, [
    'schemaVersion',
    'authorityTick',
    'teamId',
    'lifePhase',
    'positionMillimeters',
    'bodyYawMilliDegrees',
    'hitVolumes',
  ], label);
  strictLiteral(record.schemaVersion, 1, `${label}.schemaVersion`);
  if (record.lifePhase !== 'alive' && record.lifePhase !== 'dead') {
    throw new RangeError(`${label}.lifePhase must be alive or dead`);
  }
  const volumes = strictArray(
    record.hitVolumes,
    1,
    COMBAT_MAX_HIT_VOLUMES_PER_POSE,
    `${label}.hitVolumes`,
  ).map((volume, index) => validateHitVolumeWithoutTree(volume, `${label}.hitVolumes[${index}]`));
  const volumeIds = new Set<string>();
  for (const volume of volumes) {
    if (volumeIds.has(volume.volumeId)) {
      throw new RangeError(`${label} contains duplicate hit volume ${volume.volumeId}`);
    }
    volumeIds.add(volume.volumeId);
  }
  return {
    schemaVersion: 1,
    authorityTick: strictInteger(
      record.authorityTick,
      0,
      MAX_AUTHORITY_TICK,
      `${label}.authorityTick`,
    ),
    teamId: strictNullableStableId(record.teamId, `${label}.teamId`),
    lifePhase: record.lifePhase,
    positionMillimeters: vector3(
      record.positionMillimeters,
      -MAX_WORLD_COORDINATE_MILLIMETERS,
      MAX_WORLD_COORDINATE_MILLIMETERS,
      `${label}.positionMillimeters`,
    ),
    bodyYawMilliDegrees: strictInteger(
      record.bodyYawMilliDegrees,
      -180_000,
      180_000,
      `${label}.bodyYawMilliDegrees`,
    ),
    hitVolumes: volumes,
  };
}

function cloneHitVolume(volume: CombatHitVolumeBoxV1): CombatHitVolumeBoxV1 {
  return {
    schemaVersion: 1,
    volumeId: volume.volumeId,
    region: volume.region,
    centerOffsetMillimeters: cloneVector(volume.centerOffsetMillimeters),
    halfExtentsMillimeters: cloneVector(volume.halfExtentsMillimeters),
  };
}

function clonePoseSample(sample: TargetPoseSampleV1): TargetPoseSampleV1 {
  return {
    schemaVersion: 1,
    authorityTick: sample.authorityTick,
    teamId: sample.teamId,
    lifePhase: sample.lifePhase,
    positionMillimeters: cloneVector(sample.positionMillimeters),
    bodyYawMilliDegrees: sample.bodyYawMilliDegrees,
    hitVolumes: sample.hitVolumes.map(cloneHitVolume),
  };
}

export function assertTargetPoseSample(
  value: TargetPoseSampleV1,
  label = 'target pose sample',
): void {
  assertStrictCombatDataTree(value, label);
  validatePoseSampleWithoutTree(value, label);
}

export function assertTargetPoseHistory(
  value: TargetPoseHistoryV1,
  label = 'target pose history',
): void {
  assertStrictCombatDataTree(value, label);
  const record = strictRecord(value, [
    'schemaVersion',
    'authorityHz',
    'capacitySamples',
    'playerId',
    'samples',
  ], label);
  strictLiteral(record.schemaVersion, 1, `${label}.schemaVersion`);
  strictLiteral(record.authorityHz, COMBAT_POSE_HISTORY_AUTHORITY_HZ, `${label}.authorityHz`);
  strictLiteral(
    record.capacitySamples,
    COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    `${label}.capacitySamples`,
  );
  strictStableId(record.playerId, `${label}.playerId`);
  const samples = strictArray(
    record.samples,
    0,
    COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    `${label}.samples`,
  );
  let previousTick = -1;
  samples.forEach((sample, index) => {
    const validated = validatePoseSampleWithoutTree(sample, `${label}.samples[${index}]`);
    if (validated.authorityTick <= previousTick) {
      throw new RangeError(`${label} samples must have unique, increasing authority ticks`);
    }
    previousTick = validated.authorityTick;
  });
}

export function createTargetPoseHistory(playerId: string): TargetPoseHistoryV1 {
  const validatedPlayerId = strictStableId(playerId, 'target pose history playerId');
  return deepFreezeCombatValue({
    schemaVersion: 1 as const,
    authorityHz: COMBAT_POSE_HISTORY_AUTHORITY_HZ,
    capacitySamples: COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    playerId: validatedPlayerId,
    samples: [] as readonly TargetPoseSampleV1[],
  });
}

export function recordTargetPoseSamples(
  history: TargetPoseHistoryV1,
  newSamples: readonly TargetPoseSampleV1[],
): TargetPoseHistoryV1 {
  assertTargetPoseHistory(history);
  assertStrictCombatDataTree(newSamples, 'new target pose samples');
  const incoming = strictArray(
    newSamples,
    1,
    COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    'new target pose samples',
  ).map((sample, index) => validatePoseSampleWithoutTree(
    sample,
    `new target pose samples[${index}]`,
  ));

  const combined = [
    ...history.samples.map(clonePoseSample),
    ...incoming.map(clonePoseSample),
  ].sort((left, right) => left.authorityTick - right.authorityTick);
  for (let index = 1; index < combined.length; index += 1) {
    if (combined[index - 1].authorityTick === combined[index].authorityTick) {
      throw new RangeError(
        `target pose history contains duplicate sample tick ${combined[index].authorityTick}`,
      );
    }
  }
  const retained = combined.slice(-COMBAT_POSE_HISTORY_CAPACITY_SAMPLES);
  return deepFreezeCombatValue({
    schemaVersion: 1 as const,
    authorityHz: COMBAT_POSE_HISTORY_AUTHORITY_HZ,
    capacitySamples: COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    playerId: history.playerId,
    samples: retained,
  });
}

export function recordTargetPoseSample(
  history: TargetPoseHistoryV1,
  sample: TargetPoseSampleV1,
): TargetPoseHistoryV1 {
  return recordTargetPoseSamples(history, [sample]);
}

export const KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1: readonly CombatHitVolumeBoxV1[]
  = deepFreezeCombatValue([
    {
      schemaVersion: 1,
      volumeId: 'head',
      region: 'head',
      centerOffsetMillimeters: { x: 0, y: 1_700, z: 0 },
      halfExtentsMillimeters: { x: 240, y: 240, z: 220 },
    },
    {
      schemaVersion: 1,
      volumeId: 'torso_upper',
      region: 'torso',
      centerOffsetMillimeters: { x: 0, y: 1_250, z: 0 },
      halfExtentsMillimeters: { x: 360, y: 420, z: 250 },
    },
    {
      schemaVersion: 1,
      volumeId: 'torso_lower',
      region: 'torso',
      centerOffsetMillimeters: { x: 0, y: 800, z: 0 },
      halfExtentsMillimeters: { x: 300, y: 220, z: 220 },
    },
    {
      schemaVersion: 1,
      volumeId: 'arm_left',
      region: 'limb',
      centerOffsetMillimeters: { x: -500, y: 1_200, z: 0 },
      halfExtentsMillimeters: { x: 140, y: 450, z: 140 },
    },
    {
      schemaVersion: 1,
      volumeId: 'arm_right',
      region: 'limb',
      centerOffsetMillimeters: { x: 500, y: 1_200, z: 0 },
      halfExtentsMillimeters: { x: 140, y: 450, z: 140 },
    },
    {
      schemaVersion: 1,
      volumeId: 'leg_left',
      region: 'limb',
      centerOffsetMillimeters: { x: -180, y: 400, z: 0 },
      halfExtentsMillimeters: { x: 160, y: 400, z: 180 },
    },
    {
      schemaVersion: 1,
      volumeId: 'leg_right',
      region: 'limb',
      centerOffsetMillimeters: { x: 180, y: 400, z: 0 },
      halfExtentsMillimeters: { x: 160, y: 400, z: 180 },
    },
  ] satisfies readonly CombatHitVolumeBoxV1[]);
