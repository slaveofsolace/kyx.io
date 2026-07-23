import type {
  MovementCollisionLayer,
  MovementVolumeKind,
} from '../sim/movement/queryPort';

export const PHYSICS_FIXTURE_SCHEMA_VERSION = 1 as const;
export const MILLIMETERS_PER_RAPIER_UNIT = 1_000 as const;
export const PHYSICS_FIXTURE_HASH_ALGORITHM = 'fnv1a64-v1' as const;

const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const MAX_ABSOLUTE_POSITION_MM = 1_000_000;
const MAX_DIMENSION_MM = 100_000;
const MAX_SPEED_MM_PER_SECOND = 100_000;
// Production map packages intentionally contain hundreds of simple authored
// primitives. The previous fixture-lab ceilings were too small for a real map,
// while these bounds still reject unbounded or mesh-derived collider floods.
const MAX_SOLIDS = 1_024;
const MAX_VOLUMES = 64;
const MAX_SNAPSHOT_DEPTH = 24;
const MAX_ARRAY_LENGTH = 2_048;
const MAX_OBJECT_FIELDS = 32;

const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const satisfies readonly MovementCollisionLayer[]);

const VOLUME_LAYER_BY_KIND: Readonly<Record<MovementVolumeKind, MovementCollisionLayer>> =
  Object.freeze({
    kill: 'kill_volume',
    forbidden: 'forbidden_volume',
    recovery: 'recovery_volume',
  });

type UnknownRecord = Record<string, unknown>;

export interface FixtureVector3Millimeters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FixtureRotationMilliDegrees {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FixtureSpawnV1 {
  readonly feetPositionMm: FixtureVector3Millimeters;
  readonly yawMilliDegrees: number;
}

export interface FixtureBoxShapeV1 {
  readonly type: 'box';
  readonly halfExtentsMm: FixtureVector3Millimeters;
}

export interface FixtureCapsuleShapeV1 {
  readonly type: 'capsule';
  readonly heightMm: number;
  readonly radiusMm: number;
}

export type FixtureSolidShapeV1 = FixtureBoxShapeV1 | FixtureCapsuleShapeV1;
export type FixtureSolidLayer = (typeof SOLID_LAYERS)[number];

export interface FixtureSolidV1 {
  readonly id: string;
  readonly layer: FixtureSolidLayer;
  readonly body: 'fixed' | 'kinematic';
  readonly centerMm: FixtureVector3Millimeters;
  readonly rotationMilliDegrees: FixtureRotationMilliDegrees;
  readonly velocityMmPerSecond: FixtureVector3Millimeters;
  readonly shape: FixtureSolidShapeV1;
}

export interface FixtureVolumeV1 {
  readonly id: string;
  readonly kind: MovementVolumeKind;
  readonly layer: 'kill_volume' | 'forbidden_volume' | 'recovery_volume';
  readonly centerMm: FixtureVector3Millimeters;
  readonly rotationMilliDegrees: FixtureRotationMilliDegrees;
  readonly shape: FixtureBoxShapeV1;
}

export interface PhysicsFixtureV1 {
  readonly schemaVersion: typeof PHYSICS_FIXTURE_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly millimetersPerRapierUnit: typeof MILLIMETERS_PER_RAPIER_UNIT;
  readonly spawn: FixtureSpawnV1;
  readonly solids: readonly FixtureSolidV1[];
  readonly volumes: readonly FixtureVolumeV1[];
}

export type PhysicsFixtureIssueCode =
  | 'PHYSICS_FIXTURE_INVALID_DATA'
  | 'PHYSICS_FIXTURE_INVALID_TYPE'
  | 'PHYSICS_FIXTURE_INVALID_VALUE'
  | 'PHYSICS_FIXTURE_REQUIRED_FIELD'
  | 'PHYSICS_FIXTURE_UNKNOWN_FIELD'
  | 'PHYSICS_FIXTURE_DUPLICATE_ID'
  | 'PHYSICS_FIXTURE_LIMIT_EXCEEDED';

export interface PhysicsFixtureValidationIssue {
  readonly code: PhysicsFixtureIssueCode;
  readonly path: string;
  readonly message: string;
}

export type PhysicsFixtureValidationResult =
  | {
    readonly ok: true;
    readonly value: PhysicsFixtureV1;
    readonly hash: string;
  }
  | {
    readonly ok: false;
    readonly issues: readonly PhysicsFixtureValidationIssue[];
  };

class SnapshotAbort extends Error {
  readonly issue: PhysicsFixtureValidationIssue;

  constructor(path: string, message: string) {
    super(message);
    this.issue = { code: 'PHYSICS_FIXTURE_INVALID_DATA', path, message };
  }
}

class Collector {
  readonly issues: PhysicsFixtureValidationIssue[] = [];

  add(code: PhysicsFixtureIssueCode, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }
}

function snapshotJson(value: unknown, path: string, active: Set<object>, depth: number): unknown {
  if (depth > MAX_SNAPSHOT_DEPTH) throw new SnapshotAbort(path, 'Fixture nesting is too deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SnapshotAbort(path, 'Fixture numbers must be finite.');
    return value;
  }
  if (typeof value !== 'object') throw new SnapshotAbort(path, 'Fixture must contain JSON data only.');
  if (active.has(value)) throw new SnapshotAbort(path, 'Fixture data cannot contain cycles.');

  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) {
      throw new SnapshotAbort(path, 'Fixture data cannot contain symbol fields.');
    }

    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) throw new SnapshotAbort(path, 'Expected a plain array.');
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !('value' in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)) {
        throw new SnapshotAbort(path, 'Array length cannot be inspected safely.');
      }
      const length = lengthDescriptor.value as number;
      if (length > MAX_ARRAY_LENGTH) throw new SnapshotAbort(path, 'Fixture array is too large.');
      const output: unknown[] = [];
      const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
      for (const key of keys) {
        if (typeof key === 'string' && !allowed.has(key)) {
          throw new SnapshotAbort(`${path}.${key}`, 'Fixture arrays cannot have named fields.');
        }
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) throw new SnapshotAbort(`${path}[${index}]`, 'Fixture arrays cannot be sparse.');
        if (!descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
          throw new SnapshotAbort(`${path}[${index}]`, 'Fixture data cannot contain accessors.');
        }
        output.push(snapshotJson(descriptor.value, `${path}[${index}]`, active, depth + 1));
      }
      return output;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      throw new SnapshotAbort(path, 'Expected a plain object.');
    }
    if (keys.length > MAX_OBJECT_FIELDS) throw new SnapshotAbort(path, 'Fixture object has too many fields.');
    const output: UnknownRecord = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
        throw new SnapshotAbort(`${path}.${key}`, 'Fixture fields must be enumerable data properties.');
      }
      output[key] = snapshotJson(descriptor.value, `${path}.${key}`, active, depth + 1);
    }
    return output;
  } finally {
    active.delete(value);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(
  value: unknown,
  path: string,
  keys: readonly string[],
  collector: Collector,
): UnknownRecord | null {
  if (!isRecord(value)) {
    collector.add('PHYSICS_FIXTURE_INVALID_TYPE', path, 'Expected an object.');
    return null;
  }
  const supported = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!supported.has(key)) {
      collector.add('PHYSICS_FIXTURE_UNKNOWN_FIELD', `${path}.${key}`, 'Unknown fixture field.');
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      collector.add('PHYSICS_FIXTURE_REQUIRED_FIELD', `${path}.${key}`, 'Required fixture field is missing.');
    }
  }
  return value;
}

function integerAt(
  value: unknown,
  path: string,
  collector: Collector,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) {
    collector.add('PHYSICS_FIXTURE_INVALID_TYPE', path, 'Expected a safe integer.');
    return 0;
  }
  const integer = value as number;
  if (integer < minimum || integer > maximum) {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', path, `Expected ${minimum}..${maximum}.`);
  }
  return integer;
}

function semanticIdAt(value: unknown, path: string, collector: Collector): string {
  if (typeof value !== 'string' || value.length > 96 || !SEMANTIC_ID.test(value)) {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', path, 'Expected a 1-96 character snake_case semantic ID.');
    return 'invalid';
  }
  return value;
}

function enumAt<T extends string>(
  value: unknown,
  path: string,
  collector: Collector,
  supported: readonly T[],
  fallback: T,
): T {
  if (typeof value !== 'string' || !supported.includes(value as T)) {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', path, 'Value is not supported.');
    return fallback;
  }
  return value as T;
}

function vectorAt(
  value: unknown,
  path: string,
  collector: Collector,
  maximumAbsolute: number,
  minimum = -maximumAbsolute,
): FixtureVector3Millimeters {
  const record = objectAt(value, path, ['x', 'y', 'z'], collector);
  return Object.freeze({
    x: integerAt(record?.x, `${path}.x`, collector, minimum, maximumAbsolute),
    y: integerAt(record?.y, `${path}.y`, collector, minimum, maximumAbsolute),
    z: integerAt(record?.z, `${path}.z`, collector, minimum, maximumAbsolute),
  });
}

function rotationAt(
  value: unknown,
  path: string,
  collector: Collector,
): FixtureRotationMilliDegrees {
  return vectorAt(value, path, collector, 360_000) as FixtureRotationMilliDegrees;
}

function shapeAt(value: unknown, path: string, collector: Collector): FixtureSolidShapeV1 {
  if (!isRecord(value)) {
    collector.add('PHYSICS_FIXTURE_INVALID_TYPE', path, 'Expected a primitive shape object.');
    return Object.freeze({
      type: 'box',
      halfExtentsMm: Object.freeze({ x: 1, y: 1, z: 1 }),
    });
  }
  if (value.type === 'capsule') {
    const record = objectAt(value, path, ['type', 'heightMm', 'radiusMm'], collector);
    const heightMm = integerAt(record?.heightMm, `${path}.heightMm`, collector, 2, MAX_DIMENSION_MM);
    const radiusMm = integerAt(record?.radiusMm, `${path}.radiusMm`, collector, 1, MAX_DIMENSION_MM / 2);
    if (heightMm < radiusMm * 2) {
      collector.add('PHYSICS_FIXTURE_INVALID_VALUE', path, 'Capsule height must be at least twice its radius.');
    }
    return Object.freeze({ type: 'capsule', heightMm, radiusMm });
  }
  const record = objectAt(value, path, ['type', 'halfExtentsMm'], collector);
  if (record?.type !== 'box') {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', `${path}.type`, 'Expected box or capsule.');
  }
  return Object.freeze({
    type: 'box',
    halfExtentsMm: vectorAt(record?.halfExtentsMm, `${path}.halfExtentsMm`, collector, MAX_DIMENSION_MM, 1),
  });
}

function solidAt(value: unknown, path: string, collector: Collector): FixtureSolidV1 {
  const record = objectAt(
    value,
    path,
    ['id', 'layer', 'body', 'centerMm', 'rotationMilliDegrees', 'velocityMmPerSecond', 'shape'],
    collector,
  );
  const layer = enumAt(record?.layer, `${path}.layer`, collector, SOLID_LAYERS, 'world_static');
  const body = enumAt(record?.body, `${path}.body`, collector, ['fixed', 'kinematic'], 'fixed');
  const velocity = vectorAt(
    record?.velocityMmPerSecond,
    `${path}.velocityMmPerSecond`,
    collector,
    MAX_SPEED_MM_PER_SECOND,
  );
  if ((layer === 'dynamic_platform') !== (body === 'kinematic')) {
    collector.add(
      'PHYSICS_FIXTURE_INVALID_VALUE',
      path,
      'Only dynamic_platform solids use a kinematic body, and every dynamic_platform must use one.',
    );
  }
  if (body === 'fixed' && (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0)) {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', `${path}.velocityMmPerSecond`, 'Fixed solids must have zero velocity.');
  }
  return Object.freeze({
    id: semanticIdAt(record?.id, `${path}.id`, collector),
    layer,
    body,
    centerMm: vectorAt(record?.centerMm, `${path}.centerMm`, collector, MAX_ABSOLUTE_POSITION_MM),
    rotationMilliDegrees: rotationAt(record?.rotationMilliDegrees, `${path}.rotationMilliDegrees`, collector),
    velocityMmPerSecond: velocity,
    shape: shapeAt(record?.shape, `${path}.shape`, collector),
  });
}

function volumeAt(value: unknown, path: string, collector: Collector): FixtureVolumeV1 {
  const record = objectAt(
    value,
    path,
    ['id', 'kind', 'layer', 'centerMm', 'rotationMilliDegrees', 'shape'],
    collector,
  );
  const kind = enumAt(
    record?.kind,
    `${path}.kind`,
    collector,
    ['kill', 'forbidden', 'recovery'] satisfies readonly MovementVolumeKind[],
    'kill',
  );
  const expectedLayer = VOLUME_LAYER_BY_KIND[kind];
  const layer = enumAt(
    record?.layer,
    `${path}.layer`,
    collector,
    ['kill_volume', 'forbidden_volume', 'recovery_volume'] as const,
    'kill_volume',
  );
  if (layer !== expectedLayer) {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', `${path}.layer`, `Expected ${expectedLayer} for ${kind}.`);
  }
  const shape = shapeAt(record?.shape, `${path}.shape`, collector);
  if (shape.type !== 'box') {
    collector.add('PHYSICS_FIXTURE_INVALID_VALUE', `${path}.shape`, 'Volumes must use box primitives.');
  }
  return Object.freeze({
    id: semanticIdAt(record?.id, `${path}.id`, collector),
    kind,
    layer,
    centerMm: vectorAt(record?.centerMm, `${path}.centerMm`, collector, MAX_ABSOLUTE_POSITION_MM),
    rotationMilliDegrees: rotationAt(record?.rotationMilliDegrees, `${path}.rotationMilliDegrees`, collector),
    shape: shape.type === 'box'
      ? shape
      : Object.freeze({ type: 'box', halfExtentsMm: Object.freeze({ x: 1, y: 1, z: 1 }) }),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function forEachUtf8Byte(value: string, consume: (byte: number) => void): void {
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) consume(codePoint);
    else if (codePoint <= 0x7ff) {
      consume(0xc0 | (codePoint >>> 6));
      consume(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      consume(0xe0 | (codePoint >>> 12));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    } else {
      consume(0xf0 | (codePoint >>> 18));
      consume(0x80 | ((codePoint >>> 12) & 0x3f));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    }
  }
}

function canonicalShapeValue(shape: FixtureSolidShapeV1): unknown {
  return shape.type === 'box'
    ? {
      type: shape.type,
      halfExtentsMm: {
        x: shape.halfExtentsMm.x,
        y: shape.halfExtentsMm.y,
        z: shape.halfExtentsMm.z,
      },
    }
    : {
      type: shape.type,
      heightMm: shape.heightMm,
      radiusMm: shape.radiusMm,
    };
}

/** Serialize only schema fields, in one platform-independent canonical order. */
export function serializePhysicsFixture(fixture: PhysicsFixtureV1): string {
  const solids = [...fixture.solids]
    .sort((left, right) => compareCodeUnits(left.id, right.id))
    .map((solid) => ({
      id: solid.id,
      layer: solid.layer,
      body: solid.body,
      centerMm: { x: solid.centerMm.x, y: solid.centerMm.y, z: solid.centerMm.z },
      rotationMilliDegrees: {
        x: solid.rotationMilliDegrees.x,
        y: solid.rotationMilliDegrees.y,
        z: solid.rotationMilliDegrees.z,
      },
      velocityMmPerSecond: {
        x: solid.velocityMmPerSecond.x,
        y: solid.velocityMmPerSecond.y,
        z: solid.velocityMmPerSecond.z,
      },
      shape: canonicalShapeValue(solid.shape),
    }));
  const volumes = [...fixture.volumes]
    .sort((left, right) => compareCodeUnits(left.id, right.id))
    .map((volume) => ({
      id: volume.id,
      kind: volume.kind,
      layer: volume.layer,
      centerMm: { x: volume.centerMm.x, y: volume.centerMm.y, z: volume.centerMm.z },
      rotationMilliDegrees: {
        x: volume.rotationMilliDegrees.x,
        y: volume.rotationMilliDegrees.y,
        z: volume.rotationMilliDegrees.z,
      },
      shape: canonicalShapeValue(volume.shape),
    }));
  return JSON.stringify({
    schemaVersion: fixture.schemaVersion,
    id: fixture.id,
    revision: fixture.revision,
    millimetersPerRapierUnit: fixture.millimetersPerRapierUnit,
    spawn: {
      feetPositionMm: {
        x: fixture.spawn.feetPositionMm.x,
        y: fixture.spawn.feetPositionMm.y,
        z: fixture.spawn.feetPositionMm.z,
      },
      yawMilliDegrees: fixture.spawn.yawMilliDegrees,
    },
    solids,
    volumes,
  });
}

export function hashPhysicsFixture(fixture: PhysicsFixtureV1): string {
  let hash = 0xcbf29ce484222325n;
  forEachUtf8Byte(serializePhysicsFixture(fixture), (byte) => {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  });
  return hash.toString(16).padStart(16, '0');
}

export function validatePhysicsFixture(input: unknown): PhysicsFixtureValidationResult {
  let snapshot: unknown;
  try {
    snapshot = snapshotJson(input, '$', new Set(), 0);
  } catch (error) {
    if (error instanceof SnapshotAbort) return { ok: false, issues: Object.freeze([error.issue]) };
    return {
      ok: false,
      issues: Object.freeze([{
        code: 'PHYSICS_FIXTURE_INVALID_DATA',
        path: '$',
        message: 'Fixture could not be inspected safely.',
      }]),
    };
  }

  const collector = new Collector();
  const record = objectAt(
    snapshot,
    '$',
    ['schemaVersion', 'id', 'revision', 'millimetersPerRapierUnit', 'spawn', 'solids', 'volumes'],
    collector,
  );
  const schemaVersion = integerAt(record?.schemaVersion, '$.schemaVersion', collector, 1, 1);
  const id = semanticIdAt(record?.id, '$.id', collector);
  const revision = integerAt(record?.revision, '$.revision', collector, 1, 1_000_000);
  const scale = integerAt(
    record?.millimetersPerRapierUnit,
    '$.millimetersPerRapierUnit',
    collector,
    MILLIMETERS_PER_RAPIER_UNIT,
    MILLIMETERS_PER_RAPIER_UNIT,
  );

  const spawnRecord = objectAt(record?.spawn, '$.spawn', ['feetPositionMm', 'yawMilliDegrees'], collector);
  const spawn: FixtureSpawnV1 = Object.freeze({
    feetPositionMm: vectorAt(
      spawnRecord?.feetPositionMm,
      '$.spawn.feetPositionMm',
      collector,
      MAX_ABSOLUTE_POSITION_MM,
    ),
    yawMilliDegrees: integerAt(
      spawnRecord?.yawMilliDegrees,
      '$.spawn.yawMilliDegrees',
      collector,
      0,
      359_999,
    ),
  });

  const solidInputs = Array.isArray(record?.solids) ? record.solids : [];
  if (!Array.isArray(record?.solids)) {
    collector.add('PHYSICS_FIXTURE_INVALID_TYPE', '$.solids', 'Expected an array.');
  } else if (solidInputs.length < 1 || solidInputs.length > MAX_SOLIDS) {
    collector.add('PHYSICS_FIXTURE_LIMIT_EXCEEDED', '$.solids', `Expected 1..${MAX_SOLIDS} solids.`);
  }
  const volumeInputs = Array.isArray(record?.volumes) ? record.volumes : [];
  if (!Array.isArray(record?.volumes)) {
    collector.add('PHYSICS_FIXTURE_INVALID_TYPE', '$.volumes', 'Expected an array.');
  } else if (volumeInputs.length < 1 || volumeInputs.length > MAX_VOLUMES) {
    collector.add('PHYSICS_FIXTURE_LIMIT_EXCEEDED', '$.volumes', `Expected 1..${MAX_VOLUMES} volumes.`);
  }

  const solids = solidInputs.map((solid, index) => solidAt(solid, `$.solids[${index}]`, collector));
  const volumes = volumeInputs.map((volume, index) => volumeAt(volume, `$.volumes[${index}]`, collector));
  const identifiers = new Set<string>();
  for (const item of [...solids, ...volumes]) {
    if (identifiers.has(item.id)) {
      collector.add('PHYSICS_FIXTURE_DUPLICATE_ID', '$', `Collider ID ${item.id} is duplicated.`);
    }
    identifiers.add(item.id);
  }

  if (collector.issues.length > 0) {
    return {
      ok: false,
      issues: Object.freeze([...collector.issues].sort((left, right) => (
        compareCodeUnits(left.path, right.path) || compareCodeUnits(left.code, right.code)
      ))),
    };
  }

  const fixture: PhysicsFixtureV1 = deepFreeze({
    schemaVersion: schemaVersion as typeof PHYSICS_FIXTURE_SCHEMA_VERSION,
    id,
    revision,
    millimetersPerRapierUnit: scale as typeof MILLIMETERS_PER_RAPIER_UNIT,
    spawn,
    solids: Object.freeze([...solids].sort((left, right) => compareCodeUnits(left.id, right.id))),
    volumes: Object.freeze([...volumes].sort((left, right) => compareCodeUnits(left.id, right.id))),
  });
  return { ok: true, value: fixture, hash: hashPhysicsFixture(fixture) };
}

export class PhysicsFixtureValidationError extends Error {
  readonly issues: readonly PhysicsFixtureValidationIssue[];

  constructor(issues: readonly PhysicsFixtureValidationIssue[]) {
    super(issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'PhysicsFixtureValidationError';
    this.issues = issues;
  }
}

export function loadPhysicsFixture(input: unknown): PhysicsFixtureV1 {
  const result = validatePhysicsFixture(input);
  if (!result.ok) throw new PhysicsFixtureValidationError(result.issues);
  return result.value;
}
