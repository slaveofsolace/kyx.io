import {
  MAP_ARTIFACT_HASH_ALGORITHM,
  MAP_PACKAGE_IDENTITY_ALGORITHM,
  MAP_PACKAGE_SCHEMA_VERSION,
  type MapArtifactRole,
  type MapArtifactV1,
  type MapAuthorityVolumeV1,
  type MapBoundsMillimeters,
  type MapPackageValidationIssue,
  type MapPackageValidationResult,
  type MapPickupV1,
  type MapSpawnSet,
  type MapSpawnV1,
  type MapTriggerV1,
  type MapVector3Millimeters,
  type MapVolumeKind,
  type MapZoneV1,
  type RuntimeMapPackageManifestV1,
} from './schema';

const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_RELATIVE_PATH = /^(?!\/)(?![a-zA-Z]:)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/;
const ZERO_DIGEST = '0'.repeat(64);
const MAX_DEPTH = 24;
const MAX_ARRAY_LENGTH = 2_048;
const MAX_OBJECT_FIELDS = 128;
const MAX_ABSOLUTE_POSITION_MM = 1_000_000;
const MAX_DIMENSION_MM = 200_000;
const MAX_STRING_LENGTH = 256;

type UnknownRecord = Record<string, unknown>;

class SnapshotAbort extends Error {
  readonly issue: MapPackageValidationIssue;

  constructor(path: string, message: string) {
    super(message);
    this.issue = { code: 'MAP_INVALID_DATA', path, message };
  }
}

class Collector {
  readonly issues: MapPackageValidationIssue[] = [];

  add(issue: MapPackageValidationIssue): void {
    this.issues.push(issue);
  }
}

function snapshotJson(value: unknown, path: string, active: Set<object>, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new SnapshotAbort(path, 'Map package nesting is too deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SnapshotAbort(path, 'Map package numbers must be finite.');
    return value;
  }
  if (typeof value !== 'object') throw new SnapshotAbort(path, 'Map package must contain JSON data only.');
  if (active.has(value)) throw new SnapshotAbort(path, 'Map package cannot contain cycles.');

  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) {
      throw new SnapshotAbort(path, 'Map package cannot contain symbol fields.');
    }
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) throw new SnapshotAbort(path, 'Expected a plain map array.');
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !('value' in lengthDescriptor)
        || !Number.isSafeInteger(lengthDescriptor.value)) {
        throw new SnapshotAbort(path, 'Map array length cannot be inspected safely.');
      }
      const length = lengthDescriptor.value as number;
      if (length > MAX_ARRAY_LENGTH) throw new SnapshotAbort(path, 'Map array is too large.');
      const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
      for (const key of keys) {
        if (typeof key === 'string' && !allowed.has(key)) {
          throw new SnapshotAbort(`${path}.${key}`, 'Map arrays cannot have named fields.');
        }
      }
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) throw new SnapshotAbort(`${path}[${index}]`, 'Map arrays cannot be sparse.');
        if (!descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
          throw new SnapshotAbort(`${path}[${index}]`, 'Map package cannot contain accessors.');
        }
        output.push(snapshotJson(descriptor.value, `${path}[${index}]`, active, depth + 1));
      }
      return output;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      throw new SnapshotAbort(path, 'Expected a plain map object.');
    }
    if (keys.length > MAX_OBJECT_FIELDS) throw new SnapshotAbort(path, 'Map object has too many fields.');
    const output: UnknownRecord = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
        throw new SnapshotAbort(`${path}.${key}`, 'Map package fields must be enumerable data properties.');
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
    collector.add({ code: 'MAP_INVALID_TYPE', path, message: 'Expected an object.' });
    return null;
  }
  const supported = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!supported.has(key)) {
      collector.add({ code: 'MAP_UNKNOWN_FIELD', path: `${path}.${key}`, message: 'Unknown map package field.' });
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      collector.add({ code: 'MAP_REQUIRED_FIELD', path: `${path}.${key}`, message: 'Required field is missing.' });
    }
  }
  return value;
}

function stringAt(
  value: unknown,
  path: string,
  collector: Collector,
  options: {
    readonly semanticId?: boolean;
    readonly allowed?: readonly string[];
    readonly pattern?: RegExp;
    readonly maximumLength?: number;
  } = {},
): string {
  if (typeof value !== 'string') {
    collector.add({ code: 'MAP_INVALID_TYPE', path, message: 'Expected a string.' });
    return '';
  }
  const maximumLength = options.maximumLength ?? MAX_STRING_LENGTH;
  if (value.length < 1 || value.length > maximumLength) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: `Expected a 1-${maximumLength} character string.` });
  }
  if (options.semanticId && !SEMANTIC_ID.test(value)) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: 'Expected a stable snake_case semantic ID.' });
  }
  if (options.allowed && !options.allowed.includes(value)) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: 'Value is not supported.' });
  }
  if (options.pattern && !options.pattern.test(value)) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: 'String does not match the required format.' });
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
    collector.add({ code: 'MAP_INVALID_TYPE', path, message: 'Expected a safe integer.' });
    return 0;
  }
  const integer = value as number;
  if (integer < minimum || integer > maximum) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: `Expected ${minimum}..${maximum}.` });
  }
  return integer;
}

function literalAt<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
  collector: Collector,
): T {
  if (value !== expected) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: `Expected ${String(expected)}.` });
  }
  return expected;
}

function vectorAt(
  value: unknown,
  path: string,
  collector: Collector,
  options: { readonly positive?: boolean } = {},
): MapVector3Millimeters {
  const record = objectAt(value, path, ['x', 'y', 'z'], collector);
  const minimum = options.positive ? 1 : -MAX_ABSOLUTE_POSITION_MM;
  const maximum = options.positive ? MAX_DIMENSION_MM : MAX_ABSOLUTE_POSITION_MM;
  return Object.freeze({
    x: integerAt(record?.x, `${path}.x`, collector, minimum, maximum),
    y: integerAt(record?.y, `${path}.y`, collector, minimum, maximum),
    z: integerAt(record?.z, `${path}.z`, collector, minimum, maximum),
  });
}

function arrayAt(value: unknown, path: string, collector: Collector, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) {
    collector.add({ code: 'MAP_INVALID_TYPE', path, message: 'Expected an array.' });
    return Object.freeze([]);
  }
  if (value.length > maximum) {
    collector.add({ code: 'MAP_INVALID_VALUE', path, message: `Array exceeds ${maximum} entries.` });
  }
  return value;
}

function stringArrayAt(
  value: unknown,
  path: string,
  collector: Collector,
  allowed?: readonly string[],
): readonly string[] {
  return Object.freeze(arrayAt(value, path, collector, 32).map((entry, index) => stringAt(
    entry,
    `${path}[${index}]`,
    collector,
    { semanticId: true, allowed },
  )));
}

function boundsAt(value: unknown, path: string, collector: Collector): MapBoundsMillimeters {
  const record = objectAt(value, path, ['minimum', 'maximum'], collector);
  const minimum = vectorAt(record?.minimum, `${path}.minimum`, collector);
  const maximum = vectorAt(record?.maximum, `${path}.maximum`, collector);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (minimum[axis] >= maximum[axis]) {
      collector.add({ code: 'MAP_INVALID_VALUE', path, message: `Bounds minimum.${axis} must be below maximum.${axis}.` });
    }
  }
  return Object.freeze({ minimum, maximum });
}

function isPointInsideBounds(point: MapVector3Millimeters, bounds: MapBoundsMillimeters): boolean {
  return (['x', 'y', 'z'] as const).every((axis) => (
    point[axis] >= bounds.minimum[axis] && point[axis] <= bounds.maximum[axis]
  ));
}

function isBoxInsideBounds(
  center: MapVector3Millimeters,
  halfExtents: MapVector3Millimeters,
  bounds: MapBoundsMillimeters,
): boolean {
  return (['x', 'y', 'z'] as const).every((axis) => (
    center[axis] - halfExtents[axis] >= bounds.minimum[axis]
    && center[axis] + halfExtents[axis] <= bounds.maximum[axis]
  ));
}

function artifactAt(
  value: unknown,
  path: string,
  expectedRole: MapArtifactRole,
  collector: Collector,
): MapArtifactV1 {
  const record = objectAt(
    value,
    path,
    ['role', 'path', 'format', 'bytes', 'sha256', 'expectedMeshNodeCount'],
    collector,
  );
  return Object.freeze({
    role: stringAt(record?.role, `${path}.role`, collector, { allowed: [expectedRole] }) as MapArtifactRole,
    path: stringAt(record?.path, `${path}.path`, collector, { pattern: SAFE_RELATIVE_PATH }),
    format: stringAt(record?.format, `${path}.format`, collector, { allowed: ['glb'] }) as 'glb',
    bytes: integerAt(record?.bytes, `${path}.bytes`, collector, 1, 100_000_000),
    sha256: stringAt(record?.sha256, `${path}.sha256`, collector, { pattern: SHA256, maximumLength: 64 }),
    expectedMeshNodeCount: integerAt(
      record?.expectedMeshNodeCount,
      `${path}.expectedMeshNodeCount`,
      collector,
      1,
      2_048,
    ),
  });
}

function zoneAt(value: unknown, path: string, collector: Collector): MapZoneV1 {
  const record = objectAt(value, path, ['id', 'callout', 'family', 'centerMm', 'halfExtentsMm'], collector);
  return Object.freeze({
    id: stringAt(record?.id, `${path}.id`, collector, { semanticId: true, maximumLength: 96 }),
    callout: stringAt(record?.callout, `${path}.callout`, collector, { maximumLength: 64 }),
    family: stringAt(record?.family, `${path}.family`, collector, { semanticId: true, maximumLength: 64 }),
    centerMm: vectorAt(record?.centerMm, `${path}.centerMm`, collector),
    halfExtentsMm: vectorAt(record?.halfExtentsMm, `${path}.halfExtentsMm`, collector, { positive: true }),
  });
}

function spawnAt(value: unknown, path: string, collector: Collector): MapSpawnV1 {
  const record = objectAt(
    value,
    path,
    ['id', 'set', 'feetPositionMm', 'yawMilliDegrees', 'escapeRouteFamilies', 'validationStatus'],
    collector,
  );
  return Object.freeze({
    id: stringAt(record?.id, `${path}.id`, collector, { semanticId: true, maximumLength: 96 }),
    set: stringAt(record?.set, `${path}.set`, collector, {
      allowed: ['west_team', 'east_team', 'deathmatch_candidate'],
    }) as MapSpawnSet,
    feetPositionMm: vectorAt(record?.feetPositionMm, `${path}.feetPositionMm`, collector),
    yawMilliDegrees: integerAt(record?.yawMilliDegrees, `${path}.yawMilliDegrees`, collector, -180_000, 180_000),
    escapeRouteFamilies: stringArrayAt(record?.escapeRouteFamilies, `${path}.escapeRouteFamilies`, collector),
    validationStatus: stringAt(record?.validationStatus, `${path}.validationStatus`, collector, {
      allowed: ['capsule_clear_unscored'],
    }) as 'capsule_clear_unscored',
  });
}

function pickupAt(value: unknown, path: string, collector: Collector): MapPickupV1 {
  const record = objectAt(value, path, ['id', 'socketId', 'zoneId', 'respawnTicks'], collector);
  return Object.freeze({
    id: stringAt(record?.id, `${path}.id`, collector, { semanticId: true, maximumLength: 96 }),
    socketId: stringAt(record?.socketId, `${path}.socketId`, collector, { semanticId: true, maximumLength: 96 }),
    zoneId: stringAt(record?.zoneId, `${path}.zoneId`, collector, { semanticId: true, maximumLength: 96 }),
    respawnTicks: integerAt(record?.respawnTicks, `${path}.respawnTicks`, collector, 1, 100_000),
  });
}

function triggerAt(value: unknown, path: string, collector: Collector): MapTriggerV1 {
  const record = objectAt(
    value,
    path,
    [
      'id', 'kind', 'centerMm', 'halfExtentsMm', 'destinationFeetMm',
      'destinationYawMilliDegrees', 'implementationStatus',
    ],
    collector,
  );
  return Object.freeze({
    id: stringAt(record?.id, `${path}.id`, collector, { semanticId: true, maximumLength: 96 }),
    kind: stringAt(record?.kind, `${path}.kind`, collector, { allowed: ['teleport'] }) as 'teleport',
    centerMm: vectorAt(record?.centerMm, `${path}.centerMm`, collector),
    halfExtentsMm: vectorAt(record?.halfExtentsMm, `${path}.halfExtentsMm`, collector, { positive: true }),
    destinationFeetMm: vectorAt(record?.destinationFeetMm, `${path}.destinationFeetMm`, collector),
    destinationYawMilliDegrees: integerAt(
      record?.destinationYawMilliDegrees,
      `${path}.destinationYawMilliDegrees`,
      collector,
      -180_000,
      180_000,
    ),
    implementationStatus: stringAt(record?.implementationStatus, `${path}.implementationStatus`, collector, {
      allowed: ['contract_only'],
    }) as 'contract_only',
  });
}

function authorityVolumeAt(value: unknown, path: string, collector: Collector): MapAuthorityVolumeV1 {
  const record = objectAt(value, path, ['id', 'kind', 'centerMm', 'halfExtentsMm'], collector);
  return Object.freeze({
    id: stringAt(record?.id, `${path}.id`, collector, { semanticId: true, maximumLength: 96 }),
    kind: stringAt(record?.kind, `${path}.kind`, collector, { allowed: ['kill', 'recovery'] }) as MapVolumeKind,
    centerMm: vectorAt(record?.centerMm, `${path}.centerMm`, collector),
    halfExtentsMm: vectorAt(record?.halfExtentsMm, `${path}.halfExtentsMm`, collector, { positive: true }),
  });
}

function compareIssues(left: MapPackageValidationIssue, right: MapPackageValidationIssue): number {
  return left.path < right.path ? -1 : left.path > right.path ? 1
    : left.code < right.code ? -1 : left.code > right.code ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  if (!Object.isFrozen(value)) Object.freeze(value);
  return value;
}

function registerIds(
  records: readonly { readonly id: string }[],
  path: string,
  collector: Collector,
  allIds: Set<string>,
): void {
  records.forEach((record, index) => {
    if (allIds.has(record.id)) {
      collector.add({
        code: 'MAP_DUPLICATE_ID',
        path: `${path}[${index}].id`,
        message: `Map package ID ${record.id} is duplicated.`,
      });
    }
    allIds.add(record.id);
  });
}

export function validateRuntimeMapPackageManifest(
  input: unknown,
): MapPackageValidationResult<RuntimeMapPackageManifestV1> {
  let snapshot: unknown;
  try {
    snapshot = snapshotJson(input, '$', new Set(), 0);
  } catch (error) {
    const issue = error instanceof SnapshotAbort
      ? error.issue
      : { code: 'MAP_INVALID_DATA' as const, path: '$', message: 'Map package could not be inspected safely.' };
    return { ok: false, issues: Object.freeze([issue]) };
  }

  const collector = new Collector();
  const record = objectAt(
    snapshot,
    '$',
    [
      'schemaVersion', 'kind', 'id', 'revision', 'displayName', 'implementationStatus',
      'identity', 'sourceSeed', 'units', 'coordinateSystem', 'boundsMm', 'supportedModes',
      'artifacts', 'zones', 'spawns', 'pickups', 'triggers', 'authorityVolumes', 'authority', 'scope',
    ],
    collector,
  );

  const identityRecord = objectAt(record?.identity, '$.identity', ['algorithm', 'digest'], collector);
  const sourceSeedRecord = objectAt(record?.sourceSeed, '$.sourceSeed', ['path', 'sha256'], collector);
  const unitsRecord = objectAt(
    record?.units,
    '$.units',
    ['distance', 'angle', 'gltfMetersPerUnit', 'millimetersPerRapierUnit'],
    collector,
  );
  const coordinateRecord = objectAt(
    record?.coordinateSystem,
    '$.coordinateSystem',
    ['handedness', 'xAxis', 'yAxis', 'zAxis', 'origin', 'gltfToMap'],
    collector,
  );
  const boundsMm = boundsAt(record?.boundsMm, '$.boundsMm', collector);
  const artifactsRecord = objectAt(record?.artifacts, '$.artifacts', ['render', 'collision'], collector);
  const renderArtifact = artifactAt(artifactsRecord?.render, '$.artifacts.render', 'render_only', collector);
  const collisionArtifact = artifactAt(
    artifactsRecord?.collision,
    '$.artifacts.collision',
    'authority_collision',
    collector,
  );
  if (renderArtifact.path === collisionArtifact.path || renderArtifact.sha256 === collisionArtifact.sha256) {
    collector.add({
      code: 'MAP_RENDER_AUTHORITY_VIOLATION',
      path: '$.artifacts',
      message: 'Render and authority collision artifacts must have different paths and hashes.',
    });
  }

  const zones = Object.freeze(arrayAt(record?.zones, '$.zones', collector, 128)
    .map((entry, index) => zoneAt(entry, `$.zones[${index}]`, collector)));
  const spawns = Object.freeze(arrayAt(record?.spawns, '$.spawns', collector, 128)
    .map((entry, index) => spawnAt(entry, `$.spawns[${index}]`, collector)));
  const pickups = Object.freeze(arrayAt(record?.pickups, '$.pickups', collector, 128)
    .map((entry, index) => pickupAt(entry, `$.pickups[${index}]`, collector)));
  const triggers = Object.freeze(arrayAt(record?.triggers, '$.triggers', collector, 128)
    .map((entry, index) => triggerAt(entry, `$.triggers[${index}]`, collector)));
  const authorityVolumes = Object.freeze(arrayAt(
    record?.authorityVolumes,
    '$.authorityVolumes',
    collector,
    64,
  ).map((entry, index) => authorityVolumeAt(entry, `$.authorityVolumes[${index}]`, collector)));

  if (zones.length < 1) {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.zones', message: 'At least one zone is required.' });
  }
  if (spawns.length < 1) {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.spawns', message: 'At least one spawn is required.' });
  }
  if (authorityVolumes.length < 1) {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.authorityVolumes', message: 'At least one authority volume is required.' });
  }

  zones.forEach((zone, index) => {
    if (!isPointInsideBounds(zone.centerMm, boundsMm)) {
      collector.add({ code: 'MAP_INVALID_VALUE', path: `$.zones[${index}].centerMm`, message: 'Zone center is outside map bounds.' });
    }
  });
  spawns.forEach((spawn, index) => {
    if (!isPointInsideBounds(spawn.feetPositionMm, boundsMm)) {
      collector.add({ code: 'MAP_INVALID_VALUE', path: `$.spawns[${index}].feetPositionMm`, message: 'Spawn is outside map bounds.' });
    }
    if (spawn.escapeRouteFamilies.length < 2) {
      collector.add({ code: 'MAP_INVALID_VALUE', path: `$.spawns[${index}].escapeRouteFamilies`, message: 'Spawn requires at least two escape route families.' });
    }
  });
  triggers.forEach((trigger, index) => {
    if (!isBoxInsideBounds(trigger.centerMm, trigger.halfExtentsMm, boundsMm)
      || !isPointInsideBounds(trigger.destinationFeetMm, boundsMm)) {
      collector.add({ code: 'MAP_INVALID_VALUE', path: `$.triggers[${index}]`, message: 'Trigger or destination exceeds map bounds.' });
    }
  });
  authorityVolumes.forEach((volume, index) => {
    if (!isBoxInsideBounds(volume.centerMm, volume.halfExtentsMm, boundsMm)) {
      collector.add({ code: 'MAP_INVALID_VALUE', path: `$.authorityVolumes[${index}]`, message: 'Authority volume exceeds map bounds.' });
    }
  });

  const allIds = new Set<string>();
  registerIds(zones, '$.zones', collector, allIds);
  registerIds(spawns, '$.spawns', collector, allIds);
  registerIds(pickups, '$.pickups', collector, allIds);
  registerIds(triggers, '$.triggers', collector, allIds);
  registerIds(authorityVolumes, '$.authorityVolumes', collector, allIds);
  const zoneIds = new Set(zones.map((zone) => zone.id));
  pickups.forEach((pickup, index) => {
    if (!zoneIds.has(pickup.zoneId)) {
      collector.add({ code: 'MAP_REFERENCE_MISSING', path: `$.pickups[${index}].zoneId`, message: 'Pickup zone does not exist.' });
    }
  });

  const authorityRecord = objectAt(
    record?.authority,
    '$.authority',
    ['defaultSpawnId', 'collisionPrimitive', 'collisionLayer', 'renderMeshesMayBeAuthority'],
    collector,
  );
  const defaultSpawnId = stringAt(authorityRecord?.defaultSpawnId, '$.authority.defaultSpawnId', collector, {
    semanticId: true,
    maximumLength: 96,
  });
  if (!spawns.some((spawn) => spawn.id === defaultSpawnId)) {
    collector.add({ code: 'MAP_REFERENCE_MISSING', path: '$.authority.defaultSpawnId', message: 'Default spawn does not exist.' });
  }

  const scopeRecord = objectAt(
    record?.scope,
    '$.scope',
    ['phase', 'runtimeFixtureLoaded', 'spawnScoringComplete', 'traversalPlaytestComplete', 'g5Passed'],
    collector,
  );

  const manifest: RuntimeMapPackageManifestV1 = {
    schemaVersion: integerAt(record?.schemaVersion, '$.schemaVersion', collector, 1, 1) as 1,
    kind: stringAt(record?.kind, '$.kind', collector, { allowed: ['runtime_map_package'] }) as 'runtime_map_package',
    id: stringAt(record?.id, '$.id', collector, { semanticId: true, maximumLength: 96 }),
    revision: integerAt(record?.revision, '$.revision', collector, 1, 1_000_000),
    displayName: stringAt(record?.displayName, '$.displayName', collector, { maximumLength: 96 }),
    implementationStatus: stringAt(record?.implementationStatus, '$.implementationStatus', collector, {
      allowed: ['runtime_fixture_only'],
    }) as 'runtime_fixture_only',
    identity: {
      algorithm: stringAt(identityRecord?.algorithm, '$.identity.algorithm', collector, {
        allowed: [MAP_PACKAGE_IDENTITY_ALGORITHM],
      }) as typeof MAP_PACKAGE_IDENTITY_ALGORITHM,
      digest: stringAt(identityRecord?.digest, '$.identity.digest', collector, { pattern: SHA256, maximumLength: 64 }),
    },
    sourceSeed: {
      path: stringAt(sourceSeedRecord?.path, '$.sourceSeed.path', collector, { pattern: SAFE_RELATIVE_PATH }),
      sha256: stringAt(sourceSeedRecord?.sha256, '$.sourceSeed.sha256', collector, { pattern: SHA256, maximumLength: 64 }),
    },
    units: {
      distance: stringAt(unitsRecord?.distance, '$.units.distance', collector, { allowed: ['millimeters'] }) as 'millimeters',
      angle: stringAt(unitsRecord?.angle, '$.units.angle', collector, { allowed: ['milli_degrees'] }) as 'milli_degrees',
      gltfMetersPerUnit: literalAt(unitsRecord?.gltfMetersPerUnit, 1, '$.units.gltfMetersPerUnit', collector),
      millimetersPerRapierUnit: literalAt(
        unitsRecord?.millimetersPerRapierUnit,
        1_000,
        '$.units.millimetersPerRapierUnit',
        collector,
      ),
    },
    coordinateSystem: {
      handedness: stringAt(coordinateRecord?.handedness, '$.coordinateSystem.handedness', collector, {
        allowed: ['right_handed'],
      }) as 'right_handed',
      xAxis: stringAt(coordinateRecord?.xAxis, '$.coordinateSystem.xAxis', collector, { allowed: ['east'] }) as 'east',
      yAxis: stringAt(coordinateRecord?.yAxis, '$.coordinateSystem.yAxis', collector, { allowed: ['up'] }) as 'up',
      zAxis: stringAt(coordinateRecord?.zAxis, '$.coordinateSystem.zAxis', collector, { allowed: ['north'] }) as 'north',
      origin: stringAt(coordinateRecord?.origin, '$.coordinateSystem.origin', collector, {
        allowed: ['press_core_floor_contact'],
      }) as 'press_core_floor_contact',
      gltfToMap: stringAt(coordinateRecord?.gltfToMap, '$.coordinateSystem.gltfToMap', collector, {
        allowed: ['x_y_negative_z'],
      }) as 'x_y_negative_z',
    },
    boundsMm,
    supportedModes: stringArrayAt(record?.supportedModes, '$.supportedModes', collector, [
      'deathmatch',
      'team_deathmatch',
    ]) as readonly ('deathmatch' | 'team_deathmatch')[],
    artifacts: {
      render: renderArtifact as MapArtifactV1 & { readonly role: 'render_only' },
      collision: collisionArtifact as MapArtifactV1 & { readonly role: 'authority_collision' },
    },
    zones,
    spawns,
    pickups,
    triggers,
    authorityVolumes,
    authority: {
      defaultSpawnId,
      collisionPrimitive: stringAt(
        authorityRecord?.collisionPrimitive,
        '$.authority.collisionPrimitive',
        collector,
        { allowed: ['oriented_box'] },
      ) as 'oriented_box',
      collisionLayer: stringAt(authorityRecord?.collisionLayer, '$.authority.collisionLayer', collector, {
        allowed: ['world_static'],
      }) as 'world_static',
      renderMeshesMayBeAuthority: literalAt(
        authorityRecord?.renderMeshesMayBeAuthority,
        false,
        '$.authority.renderMeshesMayBeAuthority',
        collector,
      ),
    },
    scope: {
      phase: stringAt(scopeRecord?.phase, '$.scope.phase', collector, { allowed: ['P6.3'] }) as 'P6.3',
      runtimeFixtureLoaded: literalAt(
        scopeRecord?.runtimeFixtureLoaded,
        true,
        '$.scope.runtimeFixtureLoaded',
        collector,
      ),
      spawnScoringComplete: literalAt(
        scopeRecord?.spawnScoringComplete,
        false,
        '$.scope.spawnScoringComplete',
        collector,
      ),
      traversalPlaytestComplete: literalAt(
        scopeRecord?.traversalPlaytestComplete,
        false,
        '$.scope.traversalPlaytestComplete',
        collector,
      ),
      g5Passed: literalAt(scopeRecord?.g5Passed, false, '$.scope.g5Passed', collector),
    },
  };

  if (manifest.schemaVersion !== MAP_PACKAGE_SCHEMA_VERSION) {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.schemaVersion', message: 'Unsupported map package schema version.' });
  }
  if (manifest.identity.algorithm !== MAP_PACKAGE_IDENTITY_ALGORITHM) {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.identity.algorithm', message: 'Unsupported map identity algorithm.' });
  }
  if (MAP_ARTIFACT_HASH_ALGORITHM !== 'sha256') {
    collector.add({ code: 'MAP_INVALID_VALUE', path: '$.artifacts', message: 'Unsupported artifact hash algorithm.' });
  }

  if (collector.issues.length > 0) {
    return { ok: false, issues: Object.freeze([...collector.issues].sort(compareIssues)) };
  }
  return { ok: true, value: deepFreeze(manifest) };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function serializeRuntimeMapPackageIdentity(manifest: RuntimeMapPackageManifestV1): string {
  return JSON.stringify(canonicalize({
    ...manifest,
    identity: {
      ...manifest.identity,
      digest: ZERO_DIGEST,
    },
  }));
}

export interface Sha256DigestPort {
  readonly digestSha256: (bytes: Uint8Array) => Promise<Uint8Array>;
}

const RUNTIME_SHA256_DIGEST_PORT: Sha256DigestPort = Object.freeze({
  async digestSha256(bytes: Uint8Array): Promise<Uint8Array> {
    // DOM and Cloudflare Worker targets expose the same Web Crypto runtime but
    // intentionally use different ambient libraries. This structural guard
    // keeps the content boundary portable without importing Node or weakening
    // the Worker/simulation TypeScript targets.
    const host = globalThis as unknown as {
      readonly crypto?: {
        readonly subtle?: {
          readonly digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
        };
      };
    };
    const subtle = host.crypto?.subtle;
    if (!subtle) throw new Error('MAP_SHA256_RUNTIME_UNAVAILABLE');
    return new Uint8Array(await subtle.digest('SHA-256', bytes));
  },
});

export async function sha256Hex(
  bytes: Uint8Array,
  port: Sha256DigestPort = RUNTIME_SHA256_DIGEST_PORT,
): Promise<string> {
  const digest = await port.digestSha256(bytes);
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new Error('MAP_SHA256_DIGEST_INVALID');
  }
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashRuntimeMapPackageIdentity(
  manifest: RuntimeMapPackageManifestV1,
): Promise<string> {
  return sha256Hex(new TextEncoder().encode(serializeRuntimeMapPackageIdentity(manifest)));
}

export async function verifyRuntimeMapPackageIdentity(
  manifest: RuntimeMapPackageManifestV1,
): Promise<MapPackageValidationResult<RuntimeMapPackageManifestV1>> {
  const digest = await hashRuntimeMapPackageIdentity(manifest);
  if (digest !== manifest.identity.digest) {
    return {
      ok: false,
      issues: Object.freeze([{
        code: 'MAP_IDENTITY_HASH_MISMATCH',
        path: '$.identity.digest',
        message: `Expected ${manifest.identity.digest}; computed ${digest}.`,
      }]),
    };
  }
  return { ok: true, value: manifest };
}

export class RuntimeMapPackageValidationError extends Error {
  readonly issues: readonly MapPackageValidationIssue[];

  constructor(issues: readonly MapPackageValidationIssue[]) {
    super(issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'RuntimeMapPackageValidationError';
    this.issues = issues;
  }
}

export async function loadRuntimeMapPackageManifest(
  input: unknown,
): Promise<RuntimeMapPackageManifestV1> {
  const validated = validateRuntimeMapPackageManifest(input);
  if (!validated.ok) throw new RuntimeMapPackageValidationError(validated.issues);
  const verified = await verifyRuntimeMapPackageIdentity(validated.value);
  if (!verified.ok) throw new RuntimeMapPackageValidationError(verified.issues);
  return verified.value;
}
